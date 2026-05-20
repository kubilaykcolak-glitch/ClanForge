export interface AnimatedBackground {
  id:           string;
  name:         string;
  description:  string;
  /** CSS class applied to the profile page wrapper element. */
  cssClass:     string;
  /** Inline CSS string used for the thumbnail preview swatch. */
  previewStyle: string;
}

export const ANIMATED_BACKGROUNDS: AnimatedBackground[] = [
  {
    id:           "none",
    name:         "None",
    description:  "Plain dark background",
    cssClass:     "",
    previewStyle: "background: #0a0a0f",
  },
  {
    id:          "aurora",
    name:        "Aurora",
    description: "Shifting northern-lights wash of green and violet",
    cssClass:    "profile-bg-aurora",
    previewStyle:
      "background: linear-gradient(135deg, #0a0a0f 0%, #0f3d28 30%, #2e1657 65%, #0a0a0f 100%)",
  },
  {
    id:          "ember",
    name:        "Ember",
    description: "Warm red and orange radial glow from the bottom",
    cssClass:    "profile-bg-ember",
    previewStyle:
      "background: radial-gradient(ellipse 95% 70% at 50% 110%, rgba(239,68,68,0.70) 0%, rgba(249,115,22,0.40) 40%, #14070a 80%)",
  },
  {
    id:          "ocean",
    name:        "Ocean",
    description: "Deep blue drift with slow undulating waves",
    cssClass:    "profile-bg-ocean",
    previewStyle:
      "background: linear-gradient(180deg, #0a1e3a 0%, #0a3a6b 45%, #062a4e 100%)",
  },
  {
    id:          "void",
    name:        "Void",
    description: "Drifting starfield against infinite darkness",
    cssClass:    "profile-bg-void",
    previewStyle:
      "background: radial-gradient(ellipse 60% 60% at 30% 40%, rgba(139,92,246,0.35) 0%, transparent 70%), #08081a",
  },
  {
    id:          "grid",
    name:        "Grid",
    description: "Slowly scrolling indigo grid lines",
    cssClass:    "profile-bg-grid",
    previewStyle:
      "background: linear-gradient(rgba(99,102,241,0.32) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.32) 1px, transparent 1px), #070912; background-size: 24px 24px",
  },
  {
    id:          "pulse",
    name:        "Pulse",
    description: "Slow-breathing radial glow centred on the page",
    cssClass:    "profile-bg-pulse",
    previewStyle:
      "background: radial-gradient(ellipse 80% 75% at 50% 50%, rgba(99,102,241,0.55) 0%, rgba(139,92,246,0.30) 40%, transparent 75%), #0a0a1e",
  },
  {
    id:          "rain",
    name:        "Rain",
    description: "Vertical falling streaks in cool blue-grey",
    cssClass:    "profile-bg-rain",
    previewStyle:
      "background: repeating-linear-gradient(180deg, transparent 0px, transparent 18px, rgba(148,163,184,0.25) 18px, rgba(148,163,184,0.25) 20px), #07090f",
  },
];
