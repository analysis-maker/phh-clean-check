// PHH standard departure clean checklist.
// Source: HomHero departure clean checklist (237 of the last 250 cleans used this exact list, 14-25 Sep 2026).
// Wording kept from HomHero. Only obvious typos fixed (KICHEN -> Kitchen, Donna -> Doona) and one exact
// duplicate removed ("Vacuumed (including couch)" is covered by "Vacuumed (including couch and under beds)").
// "na: true" means the item says "if applicable / if required", so the cleaner may mark it N/A instead of ticking.
window.PHH_CHECKLIST = {
  version: "2026-09-25-hh60",
  sections: [
    { id: "outdoor", title: "Outdoor areas", items: [
      { id: "out_sweep", text: "Swept & cobwebs removed" },
      { id: "out_mop", text: "Mopped (if required)", na: true },
      { id: "out_flyscreens", text: "Flyscreens checked" },
      { id: "out_bbq", text: "BBQ clean & 2 gas canisters available (check both bottles are full, refill if required)", na: true }
    ]},
    { id: "living", title: "Living room", items: [
      { id: "liv_tv_unit", text: "TV unit, tables and coffee tables in correct places" },
      { id: "liv_tv_on", text: "TV turned on to check it is working" },
      { id: "liv_fireplace", text: "Fireplace area tidy & clean (if applicable)", na: true },
      { id: "liv_couch", text: "Couches checked for stains (contact team if a professional is required)" },
      { id: "liv_chairs", text: "Chairs checked for stains and cleaned if required" }
    ]},
    { id: "kitchen", title: "Kitchen, dining & dryer", items: [
      { id: "kit_tea", text: "Tea, coffee, sugar stocked up" },
      { id: "kit_oven", text: "Stovetop & oven cleaned" },
      { id: "kit_sink", text: "Sink cleaned" },
      { id: "kit_plates", text: "Plates, glasses & mugs cleaned or checked" },
      { id: "kit_micro", text: "Microwave cleaned" },
      { id: "kit_fridge", text: "Fridge & freezer clean (inside & out), guest items removed" },
      { id: "kit_dryer", text: "Dryer lint filter cleaned" },
      { id: "kit_consumables", text: "Dishwashing powder, spray & wipe, chux, sponge, dishwashing liquid and hand soap available" },
      { id: "kit_dw_filter", text: "Dishwasher filter cleaned and dishwasher empty" },
      { id: "kit_condiments", text: "Condiments fully stocked" },
      { id: "kit_bin", text: "Bin area cleaned" },
      { id: "kit_benches", text: "Benches & cupboard doors clean" },
      { id: "kit_dining", text: "All dining chairs, stools & high chairs cleaned" },
      { id: "kit_teatowel", text: "Tea towel left out with one spare" }
    ]},
    { id: "bedrooms", title: "Bedrooms", items: [
      { id: "bed_wardrobe", text: "Wardrobe doors cleaned" },
      { id: "bed_doona", text: "Doona covers (changed at least every 4th clean)" },
      { id: "bed_lamps", text: "Bedside lamps dusted and checked" },
      { id: "bed_cabinets", text: "Bedside cabinets wiped & dusted (top & shelf)" },
      { id: "bed_bedhead", text: "Bedhead dusted & cleaned" }
    ]},
    { id: "bathrooms", title: "Bathrooms", items: [
      { id: "bath_toilet", text: "Toilet cleaned" },
      { id: "bath_tiles", text: "Tiles and floors cleaned" },
      { id: "bath_dispensers", text: "Soap & shampoo dispensers filled (if applicable)", na: true },
      { id: "bath_sink", text: "Sink cleaned" },
      { id: "bath_shower", text: "Shower cleaned (no mould or soap scum)" },
      { id: "bath_soap", text: "Old soap disposed of" },
      { id: "bath_mirrors", text: "Mirrors cleaned" }
    ]},
    { id: "all", title: "All areas", items: [
      { id: "all_portacot", text: "Portacot, highchair & Bluetooth speaker checked, cleaned if required", na: true },
      { id: "all_aircon", text: "Air conditioner filter(s) cleaned (quarterly)", na: true },
      { id: "all_sills", text: "Window sills dusted" },
      { id: "all_walls", text: "Walls checked for marks (cleaned if required)" },
      { id: "all_vacuum", text: "Vacuumed (including couch and under beds where accessible)" },
      { id: "all_mop", text: "Floors mopped" },
      { id: "all_cornices", text: "Cornices dusted (no cobwebs or insects)" },
      { id: "all_washer", text: "Washing machine empty" },
      { id: "all_gas", text: "House gas bottles checked (any empty?)", na: true },
      { id: "all_globes", text: "Blown light globes replaced" },
      { id: "all_firewood", text: "Firewood checked (does not need restocking, report via maintenance tab)", na: true },
      { id: "all_noiseaware", text: "NoiseAware devices plugged in and switched on" }
    ]}
  ],
  // The six photos HomHero already mandates ("No photos, no payment").
  photos: [
    { id: "ph_couch", label: "Living room couch" },
    { id: "ph_benches", label: "Kitchen benches" },
    { id: "ph_oven", label: "Oven" },
    { id: "ph_shower", label: "Shower recess" },
    { id: "ph_toilet", label: "Toilet area" },
    { id: "ph_patio", label: "Patio / deck" }
  ]
};
