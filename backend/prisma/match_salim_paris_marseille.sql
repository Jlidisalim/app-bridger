-- ============================================================================
-- Match Salim Jlidi's Paris→Marseille shipment to user +21653935200
--   Sender   : Salim Jlidi      (phone +21626901747)
--   Traveler : matched user     (phone +21653935200)
--   Action   : flip existing OPEN Deal → MATCHED, or insert a new MATCHED Deal
-- Run inside a single transaction; rolls back automatically on any error.
-- ============================================================================

BEGIN;

DO $$
DECLARE
    sender_id     TEXT;
    traveler_id   TEXT;
    deal_id       TEXT;
    deal_count    INT;
    new_deal_id   TEXT;
BEGIN
    -- 1) Resolve sender (Salim Jlidi)
    SELECT id INTO sender_id
    FROM "User"
    WHERE phone = '+21626901747';

    IF sender_id IS NULL THEN
        RAISE EXCEPTION 'Sender not found for phone +21626901747 (Salim Jlidi)';
    END IF;

    -- 2) Resolve traveler (matched user)
    SELECT id INTO traveler_id
    FROM "User"
    WHERE phone = '+21653935200';

    IF traveler_id IS NULL THEN
        RAISE EXCEPTION 'Traveler not found for phone +21653935200';
    END IF;

    IF sender_id = traveler_id THEN
        RAISE EXCEPTION 'Sender and traveler are the same user — refusing to self-match';
    END IF;

    RAISE NOTICE 'Sender id   : %', sender_id;
    RAISE NOTICE 'Traveler id : %', traveler_id;

    -- 3) Look for an existing OPEN Paris→Marseille deal from Salim
    SELECT id INTO deal_id
    FROM "Deal"
    WHERE "senderId" = sender_id
      AND "fromCity" ILIKE 'paris'
      AND "toCity"   ILIKE 'marseille'
      AND status = 'OPEN'
    ORDER BY "createdAt" DESC
    LIMIT 1;

    IF deal_id IS NOT NULL THEN
        -- 3a) Flip status to MATCHED and attach the traveler
        UPDATE "Deal"
        SET status       = 'MATCHED',
            "travelerId" = traveler_id,
            "updatedAt"  = NOW()
        WHERE id = deal_id;

        RAISE NOTICE 'Updated existing deal % → MATCHED', deal_id;
    ELSE
        -- 3b) No OPEN deal exists; create one already in MATCHED state
        new_deal_id := 'cl' || substr(md5(random()::text || clock_timestamp()::text), 1, 23);

        INSERT INTO "Deal" (
            id, "senderId", "travelerId",
            title, description,
            "fromCity", "toCity", "fromCountry", "toCountry",
            "packageSize", "isFragile",
            weight, price, currency,
            status,
            "pickupDate", "deliveryDate",
            "createdAt", "updatedAt"
        ) VALUES (
            new_deal_id, sender_id, traveler_id,
            'Colis Paris → Marseille',
            'Petit colis personnel à transporter de Paris à Marseille.',
            'Paris', 'Marseille', 'France', 'France',
            'MEDIUM', false,
            2.0, 50.0, 'EUR',
            'MATCHED',
            NOW() + INTERVAL '3 days',
            NOW() + INTERVAL '4 days',
            NOW(), NOW()
        );

        deal_id := new_deal_id;
        RAISE NOTICE 'Inserted new deal % in MATCHED state', deal_id;
    END IF;

    -- 4) Sanity check: exactly one matched deal for this pair on this route
    SELECT COUNT(*) INTO deal_count
    FROM "Deal"
    WHERE id = deal_id
      AND status = 'MATCHED'
      AND "senderId" = sender_id
      AND "travelerId" = traveler_id;

    IF deal_count <> 1 THEN
        RAISE EXCEPTION 'Post-condition failed: deal % is not in expected MATCHED state', deal_id;
    END IF;

    RAISE NOTICE 'OK — deal % is MATCHED (sender=%, traveler=%)', deal_id, sender_id, traveler_id;
END $$;

-- 5) Show the final row so you can confirm visually before committing
SELECT id, "senderId", "travelerId", "fromCity", "toCity",
       status, price, currency, "pickupDate", "updatedAt"
FROM "Deal"
WHERE "senderId" = (SELECT id FROM "User" WHERE phone = '+21626901747')
  AND "fromCity" ILIKE 'paris'
  AND "toCity"   ILIKE 'marseille'
ORDER BY "updatedAt" DESC
LIMIT 5;

COMMIT;
-- If something looked wrong above, run `ROLLBACK;` instead of `COMMIT;`.
