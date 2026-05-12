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
      "background: linear-gradient(135deg, #0d1117 0%, #0e2a1a 35%, #1a0e2e 65%, #0a0a0f 100%)",
  },
  {
    id:          "ember",
    name:        "Ember",
    description: "Warm red and orange radial glow from the bottom",
    cssClass:    "profile-bg-ember",
    previewStyle:
      "background: radial-gradient(ellipse 80% 50% at 50% 120%, rgba(239,68,68,0.45) 0%, rgba(249,115,22,0.20) 40%, #0a0a0f 75%)",
  },
  {
    id:          "ocean",
    name:        "Ocean",
    description: "Deep blue drift with slow undulating waves",
    cssClass:    "profile-bg-ocean",
    previewStyle:
      "background: linear-gradient(180deg, #0a0a0f 0%, #041c3a 50%, #062040 100%)",
  },
  {
    id:          "void",
    name:        "Void",
    description: "Drifting starfield against infinite darkness",
    cssClass:    "profile-bg-void",
    previewStyle:
      "background: radial-gradient(ellipse 60% 60% at 30% 40%, rgba(139,92,246,0.12) 0%, transparent 70%), #050508",
  },
  {
    id:          "grid",
    name:        "Grid",
    description: "Slowly scrolling indigo grid lines",
    cssClass:    "profile-bg-grid",
    previewStyle:
      "background: linear-gradient(rgba(99,102,241,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.12) 1px, transparent 1px), #0a0a0f; background-size: 32px 32px",
  },
  {
    id:          "pulse",
    name:        "Pulse",
    description: "Slow-breathing radial glow centred on the page",
    cssClass:    "profile-bg-pulse",
    previewStyle:
      "background: radial-gradient(ellipse 70% 70% at 50% 50%, rgba(99,102,241,0.18) 0%, transparent 70%), #0a0a0f",
  },
  {
    id:          "rain",
    name:        "Rain",
    description: "Vertical falling streaks in cool blue-grey",
    cssClass:    "profile-bg-rain",
    previewStyle:
      "background: repeating-linear-gradient(180deg, transparent 0px, transparent 18px, rgba(148,163,184,0.06) 18px, rgba(148,163,184,0.06) 20px), #0a0a0f",
  },
];
