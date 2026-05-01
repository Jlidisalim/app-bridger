# The Design System: Architectural Clarity

## 1. Overview & Creative North Star
### The Creative North Star: "The Intelligent Monolith"
This design system moves away from the "busy" nature of traditional SaaS dashboards. Instead of a cluttered grid of widgets, we treat the interface as an **Architectural Monolith**. The goal is to provide an experience that feels curated, high-authority, and calm. 

We break the "template" look by utilizing **Intentional Asymmetry** and **Tonal Depth**. Rather than boxing users in with rigid borders, we use expansive breathing room and sophisticated layering. The interface should feel like an editorial spread in a high-end financial journal—authoritative, yet effortless.

---

## 2. Colors & Surface Logic
The palette is rooted in deep, intellectual blues, but its sophistication comes from how we layer these tones.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders for sectioning or layout containment. 
*   **Boundaries** must be defined solely through background color shifts.
*   **Implementation:** Place a `surface_container_lowest` card on a `surface` background. The subtle shift from `#ffffff` to `#f7f9fb` provides all the definition required for a premium feel.

### Surface Hierarchy & Nesting
Treat the UI as physical layers of "Fine Paper." Importance is signaled by "lifting" or "sinking" elements through the container tokens:
*   **Base Layer:** `surface` (#f7f9fb) – The canvas.
*   **Sub-Sections:** `surface_container_low` (#f2f4f6) – For secondary content or sidebar backgrounds.
*   **Primary Focus:** `surface_container_lowest` (#ffffff) – For main data cards and interactive elements.
*   **Interactions:** Use `surface_container_high` (#e6e8ea) for hover states or active selection backgrounds.

### The "Glass & Gradient" Rule
To prevent the UI from feeling "flat" or "utility-grade," main CTA buttons and high-level risk score visualizations should utilize a subtle **Linear Gradient**:
*   *From* `primary_container` (#1e3a8a) *to* `primary` (#00236f).
*   For floating navigation or modals, apply **Glassmorphism**: Use `surface_container_lowest` at 80% opacity with a `20px` backdrop-blur.

---

## 3. Typography: The Editorial Voice
We use **Inter** as our typographic backbone, focusing on aggressive scale contrast to guide the eye without the need for icons.

*   **Display & Headlines:** Use `display-sm` (2.25rem) for high-level KPI values. It should feel monumental. 
*   **The Power of Labels:** Use `label-md` (0.75rem) in all-caps with +0.05em tracking for category headers. This adds an "archival" or "systematic" aesthetic.
*   **Body Copy:** Keep `body-md` (0.875rem) as the workhorse. Use `on_surface_variant` (#444651) for secondary descriptions to reduce visual noise.
*   **Hierarchy via Weight:** Headlines should be Semi-Bold (600), while body text remains Regular (400). Never use Bold (700) unless it is for a critical "Risk Score" alert.

---

## 4. Elevation & Depth
Depth is a psychological tool, not a decorative one. We use **Tonal Layering** to convey importance.

*   **Ambient Shadows:** When an element must "float" (like a dropdown or a critical risk alert), use a shadow with a blur radius of `32px` and an opacity of `6%`. The shadow color must be tinted with the `primary` tone (e.g., `rgba(0, 35, 111, 0.06)`), never pure black.
*   **The Layering Principle:** A `surface_container_lowest` (#ffffff) card sitting on a `surface_container_low` (#f2f4f6) section creates a natural "lift" that mimics physical paper.
*   **The "Ghost Border" Fallback:** If a divider is strictly necessary for accessibility (e.g., in complex data tables), use the `outline_variant` token at **15% opacity**. A 100% opaque border is considered a design failure in this system.

---

## 5. Components: Refined Primitives

### KPI Cards
*   **Layout:** No borders. Use `md` (12px) rounded corners.
*   **Content:** Large `display-sm` value top-aligned. Secondary `label-md` description bottom-aligned.
*   **Visual Soul:** Apply a 4px vertical accent bar on the left side using `secondary` (#4b41e1) to denote "active" or "trending" metrics.

### Sidebar Navigation
*   **Background:** `surface_container_low`.
*   **Active State:** No "pill" background. Use a change in text color to `primary` and a 2px horizontal line indicator next to the text.
*   **Spacing:** High vertical padding (16px per item) to emphasize "The Digital Curator" aesthetic.

### Data Tables
*   **Rule:** Forbid all horizontal and vertical divider lines.
*   **Separation:** Use `8px` of vertical white space between rows.
*   **Row Styling:** On hover, the entire row should shift to `surface_container_lowest` with a subtle `2px` offset shadow.
*   **Status Badges:** Use `sm` (4px) rounded corners. Backgrounds should be the "Container" version of the color (e.g., `error_container`) with text in the `on_error_container` color.

### Risk Scores
*   **Visual:** A circular gauge or a thick horizontal bar.
*   **Color Logic:** Use a gradient transition. A "High Risk" score shouldn't just be red; it should transition from `tertiary` (#4b1c00) to `error` (#ba1a1a) for tonal depth.

---

## 6. Do’s and Don’ts

### Do
*   **Do** use asymmetrical layouts (e.g., a wide 8-column main content area paired with a slim 4-column contextual sidebar).
*   **Do** use `secondary_container` for soft highlights; it provides a professional indigo glow without the harshness of a primary action button.
*   **Do** prioritize "Negative Space." If a screen feels crowded, increase the margin rather than adding a border.

### Don't
*   **Don't** use 100% black (#000000) for text. Always use `on_surface` (#191c1e).
*   **Don't** use "Default" shadows. If the shadow is clearly visible, it is too heavy.
*   **Don't** use icons for everything. Let the typography and color hierarchy tell the story.
*   **Don't** use hard corners. Every interactive element must adhere to the `md` (0.75rem / 12px) roundedness scale.