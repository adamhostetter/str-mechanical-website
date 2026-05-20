// One-shot: inject the "Commercial Refrigeration" service entry + refrigeration
// equipment types into each branch config (greenville, raleigh-durham,
// virginia-beach). Root config.json is edited separately.

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const BRANCHES = ["greenville", "raleigh-durham", "virginia-beach"];

const REFRIGERATION_SERVICE = {
  key: "refrigeration",
  title: "Commercial Refrigeration",
  body: "Walk-in coolers and freezers, reach-ins, ice machines, refrigerated display cases — service, repair, and 24/7 emergency response.",
};

const REFRIGERATION_EQUIPMENT = [
  "Ice Machines",
  "Refrigerated Display Cases",
  "Rack Systems & Remote Condensers",
  "Reach-In Coolers & Freezers",
  "Walk-In Coolers & Freezers",
];

for (const branch of BRANCHES) {
  const file = path.join(root, "branches", branch, "config.json");
  const cfg = JSON.parse(fs.readFileSync(file, "utf8"));

  // Insert refrigeration right after controls.
  const services = cfg.services || [];
  if (!services.some(s => s.key === "refrigeration")) {
    const controlsIdx = services.findIndex(s => s.key === "controls");
    const insertIdx = controlsIdx >= 0 ? controlsIdx + 1 : services.length;
    services.splice(insertIdx, 0, REFRIGERATION_SERVICE);
    cfg.services = services;
  }

  // Merge refrigeration equipment into technicalExperience, then re-sort.
  const tech = new Set(cfg.technicalExperience || []);
  for (const item of REFRIGERATION_EQUIPMENT) tech.add(item);
  cfg.technicalExperience = [...tech].sort((a, b) => a.localeCompare(b));

  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  console.log(`✓ ${branch}/config.json — refrigeration service + equipment merged`);
}
