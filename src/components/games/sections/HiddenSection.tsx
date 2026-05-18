// Placeholder loader target for `status: "hidden"` sections. The router
// 404s hidden sections before they reach a component, so this file should
// never actually render at runtime — it exists so the dynamic `loader`
// type-checks. Flipping a section to `status: "live"` requires repointing
// the loader at a real component.

export default function HiddenSection() {
  return null;
}
