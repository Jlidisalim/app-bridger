"""
ID Card OCR — extracts first name, last name, and date of birth
from ID document images using EasyOCR.

Supports bilingual IDs (Arabic + Latin script). Arabic names are
transliterated to Latin for cross-language comparison.
"""

import re
import logging
import numpy as np
from typing import Optional

logger = logging.getLogger(__name__)

# ── Language config ────────────────────────────────────────────────────────────
# EasyOCR restriction: Arabic is ONLY compatible with ['ar','fa','ur','ug','en'].
# We use two separate readers to support both Arabic and Latin-script IDs.

_reader_arabic = None
_reader_latin  = None

def _get_reader_arabic():
    global _reader_arabic
    if _reader_arabic is None:
        import easyocr
        _reader_arabic = easyocr.Reader(['ar', 'en'], gpu=False, verbose=False)
        logger.info("EasyOCR Arabic reader loaded")
    return _reader_arabic

def _get_reader_latin():
    global _reader_latin
    if _reader_latin is None:
        import easyocr
        # Languages MUST match what the Dockerfile pre-downloads (en+fr).
        # On Azure the container has no usable network egress for EasyOCR's
        # model CDN at runtime, so any language not baked into the image
        # silently fails to load and the reader returns nothing — which
        # is what made id_number/birthday come back null in production.
        _reader_latin = easyocr.Reader(['en', 'fr'], gpu=False, verbose=False)
        logger.info("EasyOCR Latin reader loaded")
    return _reader_latin


# ── Numeral normalisation ──────────────────────────────────────────────────────

def _normalise_digits(text: str) -> str:
    """Convert Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) to ASCII digits."""
    mapping = str.maketrans(
        '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
        '01234567890123456789'
    )
    return text.translate(mapping)


# ── Arabic → Latin transliteration ────────────────────────────────────────────

_AR_TO_LATIN = [
    ('اي', 'ai'), ('او', 'ou'), ('أ', 'a'), ('إ', 'i'), ('آ', 'a'),
    ('ؤ', 'ou'), ('ئ', 'i'), ('ء', ''),
    ('ث', 'th'), ('خ', 'kh'), ('ذ', 'dh'), ('ش', 'sh'), ('ص', 's'),
    ('ض', 'd'),  ('ط', 't'),  ('ظ', 'dh'), ('غ', 'gh'), ('ق', 'k'),
    ('ا', 'a'), ('ب', 'b'), ('ت', 't'), ('ج', 'dj'), ('ح', 'h'),
    ('د', 'd'), ('ر', 'r'),  ('ز', 'z'), ('س', 's'),  ('ع', 'a'),
    ('ف', 'f'), ('ك', 'k'),  ('ل', 'l'), ('م', 'm'),  ('ن', 'n'),
    ('ه', 'h'), ('و', 'ou'), ('ي', 'i'), ('ى', 'a'), ('ة', 'a'),
    # Diacritics → ignore
    ('\u0651', ''), ('\u064e', ''), ('\u064f', ''), ('\u0650', ''),
    ('\u0652', ''), ('\u0653', ''), ('\u0654', ''), ('\u0655', ''),
]

def _arabic_to_latin(text: str) -> str:
    # Strip Arabic definite article 'ال' from the start of each word
    words = text.split()
    stripped = []
    for w in words:
        if w.startswith('ال') and len(w) > 2:
            w = w[2:]
        stripped.append(w)
    result = ' '.join(stripped)
    for ar, lat in _AR_TO_LATIN:
        result = result.replace(ar, lat)
    result = re.sub(r'([aeiou])\1+', r'\1', result)
    return re.sub(r'\s+', ' ', result).strip().title()

def _is_arabic(text: str) -> bool:
    return bool(re.search(r'[\u0600-\u06FF]', text))

def _to_latin(text: str) -> str:
    return _arabic_to_latin(text) if _is_arabic(text) else text


def _extract_embedded_value(label_text: str, field: str) -> str | None:
    """
    When OCR merges a label and its value into one detection (e.g. "اللقب أمل"),
    extract the value portion that follows the label keyword.
    Returns a cleaned name string or None.
    """
    label_lower = label_text.lower()
    if field == 'last_name':
        keywords = ['اللقب', 'لقب', 'الكنية']
    else:
        keywords = ['الاسم', 'لاسم', 'اسم', 'اللسم']

    for kw in keywords:
        idx = label_lower.find(kw)
        if idx != -1:
            remainder = label_text[idx + len(kw):].strip()
            tokens = [t for t in remainder.split() if _is_arabic(t) and t not in _AR_HEADER_STOPWORDS]
            if tokens:
                return _clean_name(tokens[0])
    return None


# ── Structured spatial extraction (bounding-box based) ─────────────────────────

def _extract_structured_arabic(image: np.ndarray, bbox_results: list) -> dict:
    """
    Use bounding boxes to correctly pair label and value columns.

    Tunisian/Arabic two-column ID cards:
      RIGHT column  →  labels  (اللقب, الاسم, تاريخ الولادة …)
      LEFT  column  →  values  (surname, first name, birthday …)

    EasyOCR's detail=0 merges these into one line, causing label/value swaps.
    With bounding boxes we can separate columns and match by row proximity.
    """
    try:
        h, w = image.shape[:2]
        regions = []
        for bbox, text, conf in bbox_results:
            text = _normalise_digits(text.strip())
            if not text or conf < 0.25:
                continue
            xs = [pt[0] for pt in bbox]
            ys = [pt[1] for pt in bbox]
            cx = sum(xs) / len(xs)
            cy = sum(ys) / len(ys)
            regions.append({'text': text, 'cx': cx, 'cy': cy})

        if not regions:
            return {}

        # Dynamic split: median x separates right (labels) from left (values)
        median_x = sorted(r['cx'] for r in regions)[len(regions) // 2]
        label_regions = [r for r in regions if r['cx'] > median_x]
        value_regions = [r for r in regions if r['cx'] <= median_x]
        row_tol = h * 0.10  # 10 % of image height = same-row tolerance

        output: dict = {}
        used_ids: set = set()  # prevent same value region from matching multiple label rows

        for lr in label_regions:
            label_lower = lr['text'].lower()

            field = None
            for kw in ['اللقب', 'لقب', 'الكنية']:
                if kw in label_lower:
                    field = 'last_name'
                    break
            if not field:
                for kw in ['الاسم', 'لاسم', 'اسم', 'اللسم']:
                    if kw in label_lower:
                        field = 'first_name'
                        break
            if not field:
                for kw in ['الولادة', 'الميلاد', 'الولا', 'ولادة', 'نارخ', 'تاريخ']:
                    if kw in label_lower:
                        field = 'birthday_text'
                        break
            if not field:
                continue

            # Collect ALL value regions at the same y-level not yet claimed, sorted right→left
            same_row = sorted(
                [r for r in value_regions
                 if abs(r['cy'] - lr['cy']) <= row_tol and id(r) not in used_ids],
                key=lambda r: r['cx'], reverse=True
            )

            # If no separate value region found, try to extract embedded value from the label
            # text itself (e.g. "اللقب أمل" where OCR merged label+value into one detection)
            if not same_row and field in ('first_name', 'last_name'):
                embedded = _extract_embedded_value(lr['text'], field)
                if embedded:
                    output[field] = embedded
                continue

            if not same_row:
                continue

            # Mark these regions as used
            for r in same_row:
                used_ids.add(id(r))

            # Join fragments: consecutive tokens ≤ 4 chars are likely OCR splits of one word
            # e.g. "الو"(3) + "ايلي"(4) → "الوايلي"
            joined: list = []
            i = 0
            while i < len(same_row):
                tok = same_row[i]['text']
                if len(tok) <= 4 and _is_arabic(tok):
                    fragment = tok
                    while i + 1 < len(same_row) and len(same_row[i + 1]['text']) <= 4 \
                            and _is_arabic(same_row[i + 1]['text']):
                        i += 1
                        fragment += same_row[i]['text']   # join without space
                    joined.append(fragment)
                else:
                    joined.append(tok)
                i += 1
            value_text = ' '.join(joined)

            if field in ('first_name', 'last_name'):
                val = _clean_name(value_text.split()[0]) if value_text.split() else None
                if val:
                    output[field] = val
            else:
                output[field] = value_text

        # Recovery: if first_name still missing, scan ALL label regions for embedded first_name
        # (handles "اللقب أمل" merged detections where the name value is inside the label region)
        if 'first_name' not in output:
            for lr in label_regions:
                embedded = _extract_embedded_value(lr['text'], 'first_name')
                if embedded and embedded != output.get('last_name'):
                    output['first_name'] = embedded
                    break

        logger.info("Structured Arabic extraction: %s", output)
        return output

    except Exception as e:
        logger.warning("Structured Arabic extraction failed: %s", e)
        return {}


# ── ID number extraction ───────────────────────────────────────────────────────

# Keywords that precede or follow the ID number on various national cards.
# Compound (multi-word) forms come first — the scoring step gives them a
# stronger proximity bonus than single-word labels.
_ID_NUMBER_KEYWORDS = [
    # Arabic compound (high specificity)
    'رقم البطاقة', 'رقم الوطنية', 'رقم الوثيقة', 'رقم التعريف',
    # Latin compound
    'numéro de la carte', 'numéro de carte', 'numéro de cin',
    'card number', 'document number', 'id number', 'national id',
    'personal number', 'national number',
    # Short labels (word-boundary anchored at use site)
    'numéro', 'numero', 'n°', 'no.', 'nr.', 'cin', 'nin',
    'id no', 'document no', 'card no',
    # Generic Arabic — last resort, lowest specificity
    'رقم',
]

# Phone-number labels — used to PENALIZE digit candidates that look like
# phone numbers rather than ID numbers (some IDs print a contact number).
_PHONE_KEYWORDS = (
    'tel', 'tél', 'tele', 'téle', 'phone', 'mob', 'gsm',
    'هاتف', 'جوال', 'موبايل',
)

# Numeric date patterns used for date-masking before ID extraction
_DATE_MASK_PATTERNS = [
    r'\b\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}\b',
    r'\b\d{4}[./\-]\d{1,2}[./\-]\d{1,2}\b',
    r'\b\d{1,2}\s+\d{1,2}\s+\d{4}\b',
    r'\b\d{4}\s+\d{1,2}\s+\d{1,2}\b',
]


def _mask_non_id_numbers(text: str) -> str:
    """
    Replace date patterns with spaces so they cannot be matched as ID numbers.
    Length-preserving so position-based proximity scoring stays accurate.
    """
    masked = text
    for pat in _DATE_MASK_PATTERNS:
        masked = re.sub(pat, lambda m: ' ' * len(m.group(0)), masked)
    # Written-month dates: "16 يوليو 2003" / "16 juillet 2003"
    month_pattern = '|'.join(
        re.escape(mn) for mn in sorted(_MONTH_NAMES, key=len, reverse=True)
    )
    masked = re.sub(
        rf'\d{{1,2}}\s+(?:{month_pattern})\s+\d{{2,4}}',
        lambda m: ' ' * len(m.group(0)),
        masked,
        flags=re.IGNORECASE,
    )
    masked = re.sub(
        rf'(?:{month_pattern})\s+\d{{2,4}}',
        lambda m: ' ' * len(m.group(0)),
        masked,
        flags=re.IGNORECASE,
    )
    return masked


def _looks_repetitive(value: str) -> bool:
    """Reject obvious OCR-noise values: 11111111, 12345678, 87654321."""
    if len(set(value)) <= 2:
        return True
    diffs = [ord(value[i + 1]) - ord(value[i]) for i in range(len(value) - 1)]
    if all(d == 1 for d in diffs) or all(d == -1 for d in diffs):
        return True
    return False


def _extract_id_number(full_text: str, latin_lines: list) -> Optional[str]:
    """
    Extract the national ID card number using a candidate-scoring strategy.

    Pipeline:
      1. Mask date patterns so they cannot be matched as ID numbers.
      2. Generate candidates from format-specific patterns:
         A — letter(s)+digits  (Moroccan CIN, passports, European IDs)
         B — long digit-only   (Algerian NIN, etc.)
         C — 8-digit Tunisian CIN (latin-OCR pass first, more reliable)
         D — medium digits     (only viable when a label is nearby)
      3. Score = base format confidence + proximity bonus from the closest
         label keyword (compound keywords yield a stronger bonus).
      4. Penalize candidates next to a phone-number keyword.
      5. Reject obvious noise (repeated/sequential digits) and
         sub-threshold candidates.

    Falls back to format match alone when OCR fails to read the label, so
    it works on any ID where a recognisable number pattern is present.
    """
    text_norm = _normalise_digits(full_text)
    masked = _mask_non_id_numbers(text_norm)
    masked_upper = masked.upper()
    text_lower = masked.lower()

    latin_text = _normalise_digits(' '.join(latin_lines))
    latin_masked = _mask_non_id_numbers(latin_text)

    # Pre-compute label keyword positions with word-boundary anchoring on
    # alphanumeric edges (prevents 'cin' from matching inside 'principal').
    keyword_hits: list[tuple[int, int, float]] = []
    for kw in _ID_NUMBER_KEYWORDS:
        prefix = r'\b' if kw[0].isalnum() else ''
        suffix = r'\b' if kw[-1].isalnum() else ''
        pat = prefix + re.escape(kw) + suffix
        weight = 0.35 if ' ' in kw else 0.20
        for m in re.finditer(pat, text_lower):
            keyword_hits.append((m.start(), m.end(), weight))

    candidates: list[dict] = []

    def add(value: str, pos: int, base_score: float) -> None:
        if _looks_repetitive(value):
            return
        end_pos = pos + len(value)
        # Closest label keyword within 40 chars contributes a proximity bonus
        bonus = 0.0
        for kw_start, kw_end, weight in keyword_hits:
            if kw_end <= pos:
                dist = pos - kw_end
            elif kw_start >= end_pos:
                dist = kw_start - end_pos
            else:
                continue
            if dist <= 40:
                bonus = max(bonus, weight * (1 - dist / 40))
        score = base_score + bonus
        # Phone-keyword penalty — only check the text IMMEDIATELY before the
        # digit (a phone label like "tel:" sits right next to its number).
        # A wider window would penalise the real CIN on the same line.
        behind = text_lower[max(0, pos - 12): pos]
        if value.isdigit() and any(pk in behind for pk in _PHONE_KEYWORDS):
            score -= 0.40
        candidates.append({'value': value, 'pos': pos, 'score': score})

    # Pattern A — letter(s) + digits (Moroccan CIN, passports, European IDs)
    for m in re.finditer(r'\b([A-Z]{1,2}\d{5,9})\b', masked_upper):
        add(m.group(1), m.start(), 0.70)

    # Pattern B — long digit-only IDs (Algerian NIN: 18 digits, etc.)
    for m in re.finditer(r'(?<!\d)(\d{12,18})(?!\d)', masked):
        add(m.group(1), m.start(), 0.70)

    # Pattern C — 8-digit Tunisian CIN; Latin-OCR pass first (more reliable
    # for digits than Arabic OCR). Includes year-prefixed values like
    # 19xxxxxx and 20xxxxxx — date-masking already removed real dates.
    seen_cin: set = set()
    for m in re.finditer(r'(?<!\d)(\d{8})(?!\d)', latin_masked):
        v = m.group(1)
        full_pos = masked.find(v)
        add(v, full_pos if full_pos != -1 else m.start(), 0.65)
        seen_cin.add(v)
    for m in re.finditer(r'(?<!\d)(\d{8})(?!\d)', masked):
        if m.group(1) not in seen_cin:
            add(m.group(1), m.start(), 0.55)

    # Pattern D — medium-length digit IDs; need a nearby label to clear threshold
    for m in re.finditer(r'(?<!\d)(\d{6,7}|\d{9,11})(?!\d)', masked):
        add(m.group(1), m.start(), 0.40)

    if not candidates:
        return None

    # Deduplicate by value, keeping the highest-scoring instance
    best_by_value: dict = {}
    for c in candidates:
        cur = best_by_value.get(c['value'])
        if cur is None or c['score'] > cur['score']:
            best_by_value[c['value']] = c

    best = max(best_by_value.values(), key=lambda c: c['score'])
    if best['score'] < 0.50:
        return None
    return best['value']


# ── Public entry point ─────────────────────────────────────────────────────────

def extract_id_info(image: np.ndarray) -> dict:
    """
    Extract date of birth and ID number from an ID card image.
    Name and last name are entered manually by the user (not OCR-extracted).
    Never raises — returns None values on failure.
    """
    _empty = {'id_number': None, 'birthday': None, 'raw_text': ''}
    try:
        arabic_bbox:  list = []   # (bbox, text, conf) with bounding boxes
        arabic_lines: list = []
        latin_lines:  list = []

        try:
            arabic_bbox = _get_reader_arabic().readtext(image, detail=1, paragraph=False)
            arabic_lines = [_normalise_digits(r[1].strip()) for r in arabic_bbox if r[1].strip()]
            logger.debug("OCR Arabic lines: %s", arabic_lines)
        except Exception as e:
            logger.warning("OCR Arabic pass failed: %s", e)

        try:
            results = _get_reader_latin().readtext(image, detail=0, paragraph=False)
            latin_lines = [_normalise_digits(r.strip()) for r in results if r.strip()]
            logger.debug("OCR Latin lines: %s", latin_lines)
        except Exception as e:
            logger.warning("OCR Latin pass failed: %s", e)

        if not arabic_lines and not latin_lines:
            logger.warning("Both OCR passes returned no text")
            return _empty

        # Merge: Latin first (better keyword labels), then Arabic
        seen: set = set()
        all_lines: list = []
        for line in latin_lines + arabic_lines:
            key = line.lower().strip()
            if key not in seen:
                seen.add(key)
                all_lines.append(line)

        full_text = ' '.join(all_lines)
        logger.info("OCR merged text (first 300): %s", full_text[:300])

        # 1. Birthday — try structured Arabic bbox extraction first, then regex
        birthday: Optional[str] = None

        if arabic_bbox:
            s = _extract_structured_arabic(image, arabic_bbox)
            bday_text = s.get('birthday_text')
            if bday_text:
                birthday = _parse_written_date(bday_text)
                if not birthday:
                    for pat in _DATE_PATTERNS:
                        m = re.search(pat, _normalise_digits(bday_text))
                        if m:
                            birthday = _normalise_date(m)
                            if birthday:
                                break

        if not birthday:
            birthday = _extract_birthday(all_lines, full_text)

        # 2. ID number extraction
        id_number = _extract_id_number(full_text, latin_lines)

        result = {
            'id_number': id_number,
            'birthday':  birthday,
            'raw_text':  full_text[:500],
        }
        logger.info("OCR extracted: %s", {k: v for k, v in result.items() if k != 'raw_text'})
        return result

    except Exception as e:
        logger.warning("OCR extraction failed: %s", e)
        return _empty


# ── Birthday ───────────────────────────────────────────────────────────────────

# Numeric date patterns (after Arabic-Indic conversion)
_DATE_PATTERNS = [
    r'\b(\d{2})[./\-](\d{2})[./\-](\d{4})\b',   # dd/mm/yyyy
    r'\b(\d{4})[./\-](\d{2})[./\-](\d{2})\b',   # yyyy/mm/dd
    r'\b(\d{2})\s+(\d{2})\s+(\d{4})\b',          # dd mm yyyy
    r'\b(\d{4})\s+(\d{2})\s+(\d{2})\b',          # yyyy mm dd (Arabic RTL order)
    r'\b(\d{2})[./\-](\d{2})[./\-](\d{2})\b',   # dd/mm/yy
]

# Written month names (Arabic + French + English)
_MONTH_NAMES: dict[str, str] = {
    'يناير': '01', 'جانفي': '01', 'جانفية': '01',
    'فبراير': '02', 'فيفري': '02',
    'مارس': '03',
    'أبريل': '04', 'ابريل': '04', 'إبريل': '04', 'افريل': '04',
    'مايو': '05', 'ماي': '05', 'ماييو': '05',
    'يونيو': '06', 'جوان': '06',
    'يوليو': '07', 'يوليه': '07', 'جويلية': '07', 'جويليه': '07', 'جويلة': '07',
    'أغسطس': '08', 'اغسطس': '08', 'أوت': '08', 'اوت': '08',
    'سبتمبر': '09', 'سبتمبر': '09',
    'أكتوبر': '10', 'اكتوبر': '10', 'أكتوبر': '10',
    'نوفمبر': '11', 'نونبر': '11',
    'ديسمبر': '12', 'دجنبر': '12',
    'janvier': '01', 'février': '02', 'fevrier': '02', 'mars': '03',
    'avril': '04', 'mai': '05', 'juin': '06', 'juillet': '07',
    'août': '08', 'aout': '08', 'septembre': '09', 'octobre': '10',
    'novembre': '11', 'décembre': '12', 'decembre': '12',
    'january': '01', 'february': '02', 'march': '03', 'april': '04',
    'may': '05', 'june': '06', 'july': '07', 'august': '08',
    'september': '09', 'october': '10', 'november': '11', 'december': '12',
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'jun': '06', 'jul': '07', 'aug': '08', 'sep': '09',
    'oct': '10', 'nov': '11', 'dec': '12',
}

_BIRTHDAY_KEYWORDS = [
    'birth', 'born', 'naissance', 'date de naissance', 'dob', 'né', 'nee',
    'تاريخ الميلاد', 'تاريخ الولادة', 'الولادة', 'الميلاد',
    # Partial OCR variants — EasyOCR sometimes splits "الولادة" into "الولا" + "دة"
    'الولا', 'ولادة', 'الميلا',
    'dogum', 'дата рождения',
]


def _parse_written_date(text: str) -> Optional[str]:
    """Parse dates with written month names: '16 يوليو 2003' → '16/07/2003'."""
    try:
        month_pattern = '|'.join(re.escape(m) for m in sorted(_MONTH_NAMES, key=len, reverse=True))
        pat = rf'(\d{{1,2}})\s+({month_pattern})\s+(\d{{2,4}})'
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            day   = m.group(1).zfill(2)
            mon   = _MONTH_NAMES.get(m.group(2).lower(), None)
            year_s = m.group(3)
            if not mon:
                return None
            if len(year_s) == 2:
                y = int(year_s)
                year_s = str(1900 + y if y > 30 else 2000 + y)
            return f"{day}/{mon}/{year_s}"
    except Exception:
        pass
    return None


def _extract_birthday(lines: list, full_text: str) -> Optional[str]:
    # 1. Look near birthday keywords
    for i, line in enumerate(lines):
        line_lower = line.lower()
        if any(k in line_lower for k in _BIRTHDAY_KEYWORDS):
            block = ' '.join(lines[max(0, i - 1):i + 3])
            result = _parse_written_date(block)
            if result:
                return result
            for pat in _DATE_PATTERNS:
                m = re.search(pat, block)
                if m:
                    d = _normalise_date(m)
                    if d:
                        return d

    # 2. Written month names anywhere
    result = _parse_written_date(full_text)
    if result:
        return result

    # 3. Numeric patterns — filter out obviously wrong values
    for pat in _DATE_PATTERNS:
        m = re.search(pat, full_text)
        if m:
            d = _normalise_date(m)
            if d:
                return d

    # 4. Partial recovery: Latin OCR garbles Arabic-Indic months (٠٧ → "92").
    #    Step A: find year + nearby day.
    #    Step B: scan full text for any readable month name (may be far from the year).
    #    If month found → return complete date.  If not → return "dd/?/yyyy".
    if any(k in full_text for k in _BIRTHDAY_KEYWORDS):
        yr_m = re.search(r'\b((?:19|20)\d{2})\b', full_text)
        if yr_m:
            year_s = yr_m.group(1)
            yr_pos  = yr_m.start()
            context = full_text[max(0, yr_pos - 80): yr_pos + 80]
            for day_m in re.finditer(r'\b([012]?\d|3[01])\b', context):
                day = int(day_m.group(1))
                if 1 <= day <= 31 and str(day) not in year_s:
                    # Step B: try to find a month name anywhere in the text
                    month_pat = '|'.join(
                        re.escape(mn) for mn in sorted(_MONTH_NAMES, key=len, reverse=True)
                    )
                    mon_m = re.search(rf'\b({month_pat})\b', full_text, re.IGNORECASE)
                    if mon_m:
                        month_num = _MONTH_NAMES.get(mon_m.group(1).lower())
                        if month_num:
                            return f"{str(day).zfill(2)}/{month_num}/{year_s}"
                    return f"{str(day).zfill(2)}/?/{year_s}"

    return None


def _normalise_date(m: re.Match) -> Optional[str]:
    g = m.groups()
    try:
        if len(g[0]) == 4:
            # yyyy mm dd
            year, x, y = int(g[0]), int(g[1]), int(g[2])
            # x is month, y is day — or swap if x > 12
            if 1 <= x <= 12 and 1 <= y <= 31:
                return f"{str(y).zfill(2)}/{str(x).zfill(2)}/{year}"
            elif 1 <= y <= 12 and 1 <= x <= 31:
                return f"{str(x).zfill(2)}/{str(y).zfill(2)}/{year}"
            return None
        else:
            # dd mm yyyy or dd mm yy
            day, mon, year_s = int(g[0]), int(g[1]), g[2]
            if len(year_s) == 2:
                yr = int(year_s)
                year_s = str(1900 + yr if yr > 30 else 2000 + yr)
            if 1 <= day <= 31 and 1 <= mon <= 12:
                return f"{str(day).zfill(2)}/{str(mon).zfill(2)}/{year_s}"
            # Swap day/month if needed
            if 1 <= mon <= 31 and 1 <= day <= 12:
                return f"{str(mon).zfill(2)}/{str(day).zfill(2)}/{year_s}"
            return None
    except (ValueError, IndexError):
        return None


# ── Name extraction ────────────────────────────────────────────────────────────

# Words that appear in Tunisian ID card headers and should never be extracted as names.
# OCR variants (ة→ف, ة→ذ) are included because EasyOCR commonly confuses these.
_AR_HEADER_STOPWORDS = {
    'الجمهورية', 'الجمهوريف', 'الجمهوريذ',
    'التونسية', 'التونسيف', 'التونسيذ',
    'الوطنية', 'الوطنيف', 'الوطني', 'وطنية', 'وطنيف', 'وطني',
    'التعريف', 'التعريذ', 'التعريف', 'تعريف',
    'بطاقة', 'بطاقه', 'بطاقهالتعريف',
}

_LAST_NAME_KEYWORDS = [
    # Arabic — with and without the definite article (OCR often drops it)
    'اللقب', 'لقب', 'الكنية', 'الاسم العائلي',
    # French / Latin
    'nom', 'surname', 'family name', 'last name',
    'apellido', 'nachname', 'familienname', 'cognome',
    'soyadı', 'soyad',
]

_FIRST_NAME_KEYWORDS = [
    # Arabic — OCR commonly drops the ال prefix: الاسم → لاسم or اسم
    # or confuses ا with ل: الاسم → اللسم
    'الاسم الشخصي', 'الاسم الأول', 'الاسم',
    'لاسم',   # OCR variant: dropped ا
    'اسم',    # OCR variant: dropped ال
    'اللسم',  # OCR variant: ا→ل confusion (alef→lam)
    # French / Latin
    'prénom', 'prenom', 'given name', 'first name', 'forename',
    'nombre', 'vorname', 'voornaam', 'nome',
    'ad', 'isim',
]


def _kw_match(keyword: str, text: str) -> bool:
    """Whole-word/phrase match (case-insensitive). Prevents 'nom' matching inside 'prénom'."""
    pattern = (r'(?<![a-zA-Z\u00C0-\u024F\u0600-\u06FF])'
               + re.escape(keyword)
               + r'(?![a-zA-Z\u00C0-\u024F\u0600-\u06FF])')
    return bool(re.search(pattern, text, re.IGNORECASE))


_AR_WORD = r'[\u0600-\u06FF]{2,}'


def _extract_last_name(lines: list, full_text: str) -> Optional[str]:
    # 1. RTL full-text regex FIRST — most accurate for Arabic/Tunisian IDs.
    #    Finds "الجليدي اللقب" pattern (value BEFORE label in RTL layout).
    for kw in ['اللقب', 'لقب', 'الكنية']:
        m = re.search(r'(' + _AR_WORD + r')\s+' + re.escape(kw) + r'(?!\S)', full_text)
        if m:
            val = _clean_name(m.group(1))
            if val:
                return val
    # 2. Line-by-line fallback (handles European/LTR IDs: "NOM: SMITH")
    return _extract_after_keyword(lines, _LAST_NAME_KEYWORDS, compound=False)


def _extract_first_name(lines: list, full_text: str) -> Optional[str]:
    # 1. RTL full-text regex FIRST — finds compound name BEFORE label.
    #    e.g. "الجليدي اللقب سليم الاسم ..." → group = "الجليدي اللقب سليم "
    #    reversed tokens: "سليم", "اللقب"(keyword→filtered), "الجليدي" → returns "سليم"
    for kw in ['الاسم', 'لاسم', 'اسم']:
        m = re.search(
            r'((?:' + _AR_WORD + r'\s+){1,8})' + re.escape(kw) + r'(?!\S)',
            full_text
        )
        if m:
            name_text = m.group(1).strip()
            tokens = name_text.split()
            for tok in reversed(tokens):
                if tok.lower() in _PATRONYMIC:
                    continue
                # Skip very short tokens — likely garbled header text (e.g. "لي", "اي", "الو")
                # Check core length after stripping definite article "ال"
                tok_core = tok[2:] if tok.startswith('ال') and len(tok) > 2 else tok
                if len(tok_core) < 3:
                    continue
                val = _clean_name(tok)
                if val and len(val) >= 2:
                    return val
    # 2. Line-by-line fallback (handles LTR European IDs)
    return _extract_after_keyword(lines, _FIRST_NAME_KEYWORDS, compound=True)


def _extract_after_keyword(lines: list, keywords: list, compound: bool = False) -> Optional[str]:
    """
    Return the name value associated with a keyword label.

    Handles both ID card orientations:
      RTL (Arabic IDs like Tunisian):  VALUE comes BEFORE the label
          e.g. OCR output: "الجليدي اللقب"  → surname = Jlidi
      LTR (European IDs):              VALUE comes AFTER the label
          e.g. "NOM: SMITH"  or  "Surname SMITH"

    compound=True: for compound first-name fields, the PRIMARY name
    is the token closest to the keyword (last in OCR before-text for RTL,
    first in OCR after-text for LTR). For RTL compound names like
    "حمودة بن محمد بن الحبيب سليم الاسم", reversed() gives "سليم" first.
    """
    for i, line in enumerate(lines):
        lower = line.lower()
        for kw in keywords:
            if not _kw_match(kw, lower):
                continue

            kw_re = re.compile(re.escape(kw), re.IGNORECASE)
            m = kw_re.search(line)
            if not m:
                continue

            before = line[:m.start()].strip()
            after  = line[m.end():].strip()

            # 1. Separator-based after keyword: "NOM: SMITH" or "اللقب: جليدي"
            if after:
                sep_parts = re.split(r'[:\-\|]', after, maxsplit=1)
                if len(sep_parts) == 2 and sep_parts[1].strip():
                    val = _clean_name(sep_parts[1].strip().split()[0])
                    if val:
                        return val

            # 2. RTL format: VALUE comes BEFORE the keyword label.
            #    For simple names:  "الجليدي اللقب" → before="الجليدي" → first reversed token
            #    For compound RTL:  "حمودة بن محمد بن الحبيب سليم الاسم"
            #                       reversed tokens: "سليم", "الحبيب", "بن", … → "سليم" ✓
            if before:
                for token in reversed(before.split()):
                    if compound and token.lower() in _PATRONYMIC:
                        continue
                    val = _clean_name(token)
                    if val and len(val) >= 2:
                        return val

            # 3. LTR format: VALUE comes AFTER the keyword label.
            #    "اللقب سليم" or "Surname Smith" or "الاسم سليم الحبيب بن محمد بن حمودة"
            if after:
                for token in after.split():
                    if compound and token.lower() in _PATRONYMIC:
                        continue
                    val = _clean_name(token)
                    if val and len(val) >= 2:
                        return val

            # 4. Value on the next line
            if i + 1 < len(lines):
                next_line = lines[i + 1]
                if compound:
                    val = _first_token_of_name(next_line)
                else:
                    val = _clean_name(next_line.split()[0]) if next_line.split() else None
                if val:
                    return val

    return None


def _clean_name(text: str) -> Optional[str]:
    """Keep alphabetic chars (Latin, Arabic, Cyrillic) and name punctuation."""
    cleaned = re.sub(
        r'[^a-zA-Z\u00C0-\u024F\u0600-\u06FF\u0400-\u04FF\s\-\']',
        '', text
    ).strip()
    # Must be ≥2 chars, not a label keyword, and not a card header word
    all_kw = {k.lower() for k in _LAST_NAME_KEYWORDS + _FIRST_NAME_KEYWORDS}
    all_kw.update(_AR_HEADER_STOPWORDS)
    if len(cleaned) >= 2 and cleaned.lower() not in all_kw:
        return cleaned
    return None


# Patronymic connectors common in Arabic/Tunisian names
_PATRONYMIC = {'بن', 'ابن', 'بنت', 'بنة', 'ben', 'bint', 'ibn'}

def _first_token_of_name(text: str) -> Optional[str]:
    """
    From a compound name like "سليم الحبيب بن محمد بن حمودة",
    return only the primary given name token (the first non-patronymic token).
    Falls back to the full cleaned string if no token qualifies.
    """
    tokens = text.split()
    for tok in tokens:
        cleaned = _clean_name(tok)
        if not cleaned:
            continue
        if cleaned.lower() in _PATRONYMIC:
            continue
        return cleaned
    return _clean_name(text)
