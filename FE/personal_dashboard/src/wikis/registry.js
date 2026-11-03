// Wikis shown in the Wikis section. To add one, drop a self-contained page at
// public/wiki-apps/<id>/index.html (load ../bridge.js with data-wiki="<id>" for
// storage, sign-in and the AI helper) and add an entry here.
export const WIKIS = [
  {
    id: "enshrouded",
    name: "Enshrouded",
    tagline: "Solo field guide for Enshrouded 1.0",
    description:
      "Level-by-level guide for every combat style, an in-game style skill tree planner with a build helper chat, " +
      "3,300+ item, creature and place pages with recipes and drops, and quest walkthroughs.",
    app: "/wiki-apps/enshrouded/index.html",
    accent: "#e8b64c",
    initials: "EN",
    tags: ["Guide", "Skill builder", "Encyclopedia", "Quests"]
  }
];

export function findWiki(id) {
  return WIKIS.find((w) => w.id === id) || null;
}
