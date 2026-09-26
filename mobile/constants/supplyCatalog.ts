export interface SupplyCatalogItem {
  name: string;
  category: string;
  unit: string;
  default_daily_use: number;
  cold_sensitivity: number;
}

export const PREDEFINED_CATEGORIES = [
  'Food & Water',
  'Fuel & Energy',
  'Medical',
  'PPE/Clothing',
  'Communication & Navigation',
  'Tools & Maintenance',
  'Scientific Equipment',
  'Emergency & Survival',
  'Hygiene & Sanitation',
  'Batteries/Power',
];

export const STANDARD_SUPPLY_CATALOG: SupplyCatalogItem[] = [
  // Food & Water
  {
    name: 'Dehydrated Ration Packs',
    category: 'Food & Water',
    unit: 'Packs',
    default_daily_use: 3.0,
    cold_sensitivity: 1.0,
  },
  {
    name: 'Canned High-Calorie Food Supplies',
    category: 'Food & Water',
    unit: 'Cans',
    default_daily_use: 2.5,
    cold_sensitivity: 1.0,
  },
  {
    name: 'Potable Water Containers (20L)',
    category: 'Food & Water',
    unit: 'Containers',
    default_daily_use: 0.5,
    cold_sensitivity: 1.5,
  },
  {
    name: 'Emergency Energy Bars',
    category: 'Food & Water',
    unit: 'Boxes',
    default_daily_use: 0.2,
    cold_sensitivity: 1.0,
  },

  // Fuel & Energy
  {
    name: 'Polar-Grade Jet-A1 Aviation Fuel',
    category: 'Fuel & Energy',
    unit: 'Litres',
    default_daily_use: 20.0,
    cold_sensitivity: 1.4,
  },
  {
    name: 'Sub-Zero Diesel Fuel (Special Additive)',
    category: 'Fuel & Energy',
    unit: 'Litres',
    default_daily_use: 25.0,
    cold_sensitivity: 1.5,
  },
  {
    name: 'Propane Heating Gas Cylinders',
    category: 'Fuel & Energy',
    unit: 'Cylinders',
    default_daily_use: 0.5,
    cold_sensitivity: 1.3,
  },

  // Medical
  {
    name: 'Extreme Cold First Aid & Frostbite Kit',
    category: 'Medical',
    unit: 'Kits',
    default_daily_use: 0.05,
    cold_sensitivity: 1.2,
  },
  {
    name: 'Emergency Oxygen Cylinders',
    category: 'Medical',
    unit: 'Cylinders',
    default_daily_use: 0.02,
    cold_sensitivity: 1.1,
  },
  {
    name: 'Trauma & Burn Surgical Supplies',
    category: 'Medical',
    unit: 'Kits',
    default_daily_use: 0.01,
    cold_sensitivity: 1.0,
  },

  // PPE/Clothing
  {
    name: 'Polar Thermal Parkas (-50C Rated)',
    category: 'PPE/Clothing',
    unit: 'Units',
    default_daily_use: 0.01,
    cold_sensitivity: 1.0,
  },
  {
    name: 'Insulated Insulated Boots & Thermal Socks',
    category: 'PPE/Clothing',
    unit: 'Pairs',
    default_daily_use: 0.02,
    cold_sensitivity: 1.0,
  },
  {
    name: 'UV-Protection Glacier Goggles',
    category: 'PPE/Clothing',
    unit: 'Units',
    default_daily_use: 0.01,
    cold_sensitivity: 1.0,
  },

  // Communication & Navigation
  {
    name: 'Iridium Extreme Satellite Phones',
    category: 'Communication & Navigation',
    unit: 'Units',
    default_daily_use: 0.01,
    cold_sensitivity: 1.5,
  },
  {
    name: 'Handheld VHF Radio Transceivers',
    category: 'Communication & Navigation',
    unit: 'Units',
    default_daily_use: 0.02,
    cold_sensitivity: 1.4,
  },
  {
    name: 'Ruggedized GPS Navigation Units',
    category: 'Communication & Navigation',
    unit: 'Units',
    default_daily_use: 0.02,
    cold_sensitivity: 1.3,
  },

  // Tools & Maintenance
  {
    name: 'Vehicle Engine Anti-Freeze (-60C)',
    category: 'Tools & Maintenance',
    unit: 'Litres',
    default_daily_use: 2.0,
    cold_sensitivity: 1.5,
  },
  {
    name: 'Sno-Cat Track Repair Spares Kit',
    category: 'Tools & Maintenance',
    unit: 'Kits',
    default_daily_use: 0.05,
    cold_sensitivity: 1.2,
  },
  {
    name: 'Heavy Duty Snow Shovels & Ice Axes',
    category: 'Tools & Maintenance',
    unit: 'Units',
    default_daily_use: 0.05,
    cold_sensitivity: 1.0,
  },

  // Scientific Equipment
  {
    name: 'Ice Core Drilling Bits & Spares',
    category: 'Scientific Equipment',
    unit: 'Units',
    default_daily_use: 0.1,
    cold_sensitivity: 1.1,
  },
  {
    name: 'Meteorological Sensor Probes',
    category: 'Scientific Equipment',
    unit: 'Units',
    default_daily_use: 0.05,
    cold_sensitivity: 1.3,
  },
  {
    name: 'Sample Cryo-Containers',
    category: 'Scientific Equipment',
    unit: 'Units',
    default_daily_use: 0.2,
    cold_sensitivity: 1.2,
  },

  // Emergency & Survival
  {
    name: 'Polar Expedition Storm Tents (4-Person)',
    category: 'Emergency & Survival',
    unit: 'Units',
    default_daily_use: 0.01,
    cold_sensitivity: 1.1,
  },
  {
    name: 'Emergency Flares & Signal Smoke Kits',
    category: 'Emergency & Survival',
    unit: 'Kits',
    default_daily_use: 0.05,
    cold_sensitivity: 1.0,
  },
  {
    name: 'Emergency Blizzard Survival Bags',
    category: 'Emergency & Survival',
    unit: 'Units',
    default_daily_use: 0.02,
    cold_sensitivity: 1.0,
  },

  // Hygiene & Sanitation
  {
    name: 'Biodegradable Sanitation Packs',
    category: 'Hygiene & Sanitation',
    unit: 'Packs',
    default_daily_use: 1.0,
    cold_sensitivity: 1.0,
  },
  {
    name: 'Waterless Cleansing Wipes',
    category: 'Hygiene & Sanitation',
    unit: 'Packs',
    default_daily_use: 0.5,
    cold_sensitivity: 1.1,
  },

  // Batteries/Power
  {
    name: 'LiFePO4 Low-Temp Solar Storage Batteries',
    category: 'Batteries/Power',
    unit: 'Units',
    default_daily_use: 0.05,
    cold_sensitivity: 1.6,
  },
  {
    name: 'Heavy-Duty AA/AAA Cold-Resistant Lithium Batteries',
    category: 'Batteries/Power',
    unit: 'Packs',
    default_daily_use: 1.0,
    cold_sensitivity: 1.5,
  },
  {
    name: 'Portable Gas Generator (3KW)',
    category: 'Batteries/Power',
    unit: 'Units',
    default_daily_use: 0.01,
    cold_sensitivity: 1.4,
  },
];
