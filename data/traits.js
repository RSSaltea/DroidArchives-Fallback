export const TRAIT_DATA = {
  "gameVersion": "1.36.0",
  "checkedAt": "2026-10-24",
  "costs": [
    {
      "rarity": "Common",
      "reveal": 5,
      "reroll": 2
    },
    {
      "rarity": "Rare",
      "reveal": 10,
      "reroll": 4
    },
    {
      "rarity": "Epic",
      "reveal": 20,
      "reroll": 6
    },
    {
      "rarity": "Legendary",
      "reveal": 35,
      "reroll": 8
    },
    {
      "rarity": "Mythic",
      "reveal": 55,
      "reroll": 10
    },
    {
      "rarity": "Iconic",
      "reveal": 200,
      "reroll": 200
    }
  ],
  "traits": [
    {
      "id": 0,
      "name": "Credit Per Second Multiplier",
      "active_in": "Worker",
      "values": {
        "Default": 0.1,
        "Gold": 0.2,
        "Diamond": 0.35,
        "Rainbow": 0.5
      },
      "value_format": "Percent",
      "description": "+{Value} Credits Per Second",
      "exclusive_droids": [],
      "exclude_iconics": true,
      "stat": null,
      "multiplier": false,
      "effect": "Increases this droid's credits per second while working."
    },
    {
      "id": 1,
      "name": "Pickaxe Level",
      "active_in": "Companion",
      "values": {
        "Default": 2.0,
        "Gold": 4.0,
        "Diamond": 6.0,
        "Rainbow": 10.0
      },
      "value_format": "Flat",
      "description": "+{Value} Pickaxe Level",
      "exclusive_droids": [],
      "exclude_iconics": false,
      "stat": "PickaxeLevel",
      "multiplier": false,
      "effect": "Adds pickaxe levels while equipped as a companion."
    },
    {
      "id": 2,
      "name": "Health",
      "active_in": "Companion",
      "values": {
        "Default": 50.0,
        "Gold": 100.0,
        "Diamond": 150.0,
        "Rainbow": 250.0
      },
      "value_format": "Flat",
      "description": "+{Value} Max Health",
      "exclusive_droids": [],
      "exclude_iconics": false,
      "stat": "MaxHP",
      "multiplier": false,
      "effect": "Adds maximum health while equipped as a companion."
    },
    {
      "id": 3,
      "name": "Crafting Speed",
      "active_in": "Companion",
      "values": {
        "Default": 0.05,
        "Gold": 0.1,
        "Diamond": 0.15,
        "Rainbow": 0.25
      },
      "value_format": "Percent",
      "description": "+{Value} Crafting Speed",
      "exclusive_droids": [],
      "exclude_iconics": false,
      "stat": "DroidDepotSpeed",
      "multiplier": true,
      "effect": "Boosts depot crafting speed while equipped as a companion."
    },
    {
      "id": 4,
      "name": "Critical Chance",
      "active_in": "Companion",
      "values": {
        "Default": 0.05,
        "Gold": 0.1,
        "Diamond": 0.15,
        "Rainbow": 0.25
      },
      "value_format": "Percent",
      "description": "+{Value} Critical Chance",
      "exclusive_droids": [],
      "exclude_iconics": false,
      "stat": "CritChance",
      "multiplier": false,
      "effect": "Adds critical-hit chance while equipped as a companion."
    },
    {
      "id": 5,
      "name": "Critical Amount",
      "active_in": "Companion",
      "values": {
        "Default": 0.1,
        "Gold": 0.2,
        "Diamond": 0.3,
        "Rainbow": 0.5
      },
      "value_format": "Percent",
      "description": "+{Value} Critical Amount",
      "exclusive_droids": [],
      "exclude_iconics": false,
      "stat": "CritAmount",
      "multiplier": false,
      "effect": "Adds critical-hit amount while equipped as a companion."
    },
    {
      "id": 6,
      "name": "Upgrade Chip Bonus",
      "active_in": "Companion",
      "values": {
        "Default": 0.2,
        "Gold": 0.4,
        "Diamond": 0.6,
        "Rainbow": 1.0
      },
      "value_format": "Percent",
      "description": "+{Value} Upgrade Chips",
      "exclusive_droids": [],
      "exclude_iconics": true,
      "stat": "UpgradeChipMulti",
      "multiplier": true,
      "effect": "Boosts the Upgrade Chip bonus while equipped as a companion."
    },
    {
      "id": 7,
      "name": "Scrap Specialist",
      "active_in": "Companion",
      "values": {
        "Default": 0.1,
        "Gold": 0.2,
        "Diamond": 0.3,
        "Rainbow": 0.5
      },
      "value_format": "Percent",
      "description": "+{Value} Credits from Scrap Stations",
      "exclusive_droids": [],
      "exclude_iconics": false,
      "stat": "ScrapCreditMulti",
      "multiplier": true,
      "effect": "Boosts scrap credits while equipped as a companion."
    },
    {
      "id": 8,
      "name": "Fusion Expert",
      "active_in": "Companion",
      "values": {
        "Default": 0.2,
        "Gold": 0.4,
        "Diamond": 0.7,
        "Rainbow": 1.0
      },
      "value_format": "Percent",
      "description": "+{Value} Pickaxe Amount on Fusions",
      "exclusive_droids": [],
      "exclude_iconics": false,
      "stat": "FusionPickaxeMulti",
      "multiplier": true,
      "effect": "Boosts pickaxe contribution to fusion while equipped as a companion."
    },
    {
      "id": 9,
      "name": "Mission Efficiency",
      "active_in": "Worker",
      "values": {
        "Default": 0.05,
        "Gold": 0.1,
        "Diamond": 0.15,
        "Rainbow": 0.25
      },
      "value_format": "Percent",
      "description": "+{Value} Astromech Mission Speed",
      "exclusive_droids": [],
      "exclude_iconics": true,
      "stat": null,
      "multiplier": false,
      "effect": "Increases mission progress speed while working."
    },
    {
      "id": 10,
      "name": "Offline Earnings",
      "active_in": "Worker",
      "values": {
        "Default": 0.02,
        "Gold": 0.04,
        "Diamond": 0.06,
        "Rainbow": 0.1
      },
      "value_format": "Percent",
      "description": "+{Value} Total Offline Earnings",
      "exclusive_droids": [],
      "exclude_iconics": false,
      "stat": "OfflineSpeedBonus",
      "multiplier": false,
      "effect": "Adds to offline earnings speed while working."
    },
    {
      "id": 11,
      "name": "Passive Credits",
      "active_in": "Companion",
      "values": {
        "Rainbow": 0.25
      },
      "value_format": "Percent",
      "description": "{Value} Credits/5sec as Companion",
      "exclusive_droids": [],
      "exclude_iconics": true,
      "stat": "PassiveCredits",
      "multiplier": false,
      "effect": "Every 5 seconds, grants 25% of this droid's credits-per-second value, then applies your credit multiplier. This is a payment every 5 seconds, not 25% per second."
    },
    {
      "id": 12,
      "name": "Overclocked",
      "active_in": "Companion",
      "values": {
        "Rainbow": 1.0
      },
      "value_format": "Hidden",
      "description": "Doubles Companion Bonus",
      "exclusive_droids": [],
      "exclude_iconics": true,
      "stat": null,
      "multiplier": false,
      "effect": "Doubles this droid's companion bonus."
    },
    {
      "id": 13,
      "name": "Chip Finder",
      "active_in": "Companion",
      "values": {
        "Rainbow": 1.0
      },
      "value_format": "Percent",
      "description": "{Value} Upgrade Chips when Building Droids",
      "exclusive_droids": [],
      "exclude_iconics": false,
      "stat": "ChipFinderBonus",
      "multiplier": false,
      "effect": "On build completion, grants Upgrade Chips based on the completed droid's chip sell value x your chip-sale multiplier x Chip Finder bonus (1.0)."
    },
    {
      "id": 14,
      "name": "Fusion Preservation",
      "active_in": "Fusion",
      "values": {
        "Rainbow": 1.0
      },
      "value_format": "Hidden",
      "description": "Droid kept if used in fusion, then trait locks",
      "exclusive_droids": [],
      "exclude_iconics": true,
      "stat": null,
      "multiplier": false,
      "effect": "Preserves this individual droid once when used in fusion. It stays in its original Fusion input slot, becomes available again and loses the trait. The game description calls this 'trait locks'; permanent rescan eligibility has not been verified."
    },
    {
      "id": 15,
      "name": "Lifesteal",
      "active_in": "Companion",
      "values": {
        "Rainbow": 0.2
      },
      "value_format": "Percent",
      "description": "Heal {Value} HP when defeating enemies",
      "exclusive_droids": [
        "Mister Bones"
      ],
      "exclude_iconics": false,
      "stat": "LifeSteal",
      "multiplier": false,
      "effect": "Heals 20% of your maximum health when you defeat an enemy."
    },
    {
      "id": 16,
      "name": "Blueprint Protector",
      "active_in": "Companion",
      "values": {
        "Rainbow": 1.0
      },
      "value_format": "Hidden",
      "description": "No one can pick up your blueprints",
      "exclusive_droids": [
        "IG-11 Marshal"
      ],
      "exclude_iconics": false,
      "stat": "BlueprintProtection",
      "multiplier": false,
      "effect": "Prevents other players picking up your blueprints."
    },
    {
      "id": 17,
      "name": "Fusion Master",
      "active_in": "Worker",
      "values": {
        "Rainbow": 1.0
      },
      "value_format": "Hidden",
      "description": "Companion Bonus Active while working",
      "exclusive_droids": [
        "D-O"
      ],
      "exclude_iconics": false,
      "stat": null,
      "multiplier": false,
      "effect": "Activates D-O's companion bonus while working."
    },
    {
      "id": 18,
      "name": "Crit Expert",
      "active_in": "Companion",
      "values": {
        "Rainbow": 1.0
      },
      "value_format": "Flat",
      "description": "+{Value} Multi Crit",
      "exclusive_droids": [
        "Chopper"
      ],
      "exclude_iconics": false,
      "stat": "MultiCrit",
      "multiplier": false,
      "effect": "Adds one Multi Crit level while equipped as a companion."
    },
    {
      "id": 19,
      "name": "Double Crate Chance",
      "active_in": "Astromech",
      "values": {
        "Rainbow": 0.5
      },
      "value_format": "Percent",
      "description": "{Value} two crates from Astromech",
      "exclusive_droids": [
        "R2-D2"
      ],
      "exclude_iconics": false,
      "stat": "AstroDoubleCrateChance",
      "multiplier": false,
      "effect": "50% chance to receive two Astromech crates."
    },
    {
      "id": 20,
      "name": "Droid Sell Master",
      "active_in": "Worker",
      "values": {
        "Rainbow": 1.0
      },
      "value_format": "Hidden",
      "description": "Companion Bonus Active while working",
      "exclusive_droids": [
        "C-3PO"
      ],
      "exclude_iconics": false,
      "stat": null,
      "multiplier": false,
      "effect": "Activates C-3PO's companion bonus while working."
    },
    {
      "id": 21,
      "name": "Upgrade Chip Master",
      "active_in": "Worker",
      "values": {
        "Rainbow": 1.0
      },
      "value_format": "Hidden",
      "description": "Companion Bonus Active while working",
      "exclusive_droids": [
        "BB-8"
      ],
      "exclude_iconics": false,
      "stat": null,
      "multiplier": false,
      "effect": "Activates BB-8's companion bonus while working."
    },
    {
      "id": 22,
      "name": "World Mission Master",
      "active_in": "Worker",
      "values": {
        "Rainbow": 1.0
      },
      "value_format": "Hidden",
      "description": "Companion Bonus Active while working",
      "exclusive_droids": [
        "DJ R-3X"
      ],
      "exclude_iconics": false,
      "stat": null,
      "multiplier": false,
      "effect": "Activates DJ R-3X's companion bonus while working."
    },
    {
      "id": 23,
      "name": "Flawless Duplicator",
      "active_in": "Companion",
      "values": {
        "Rainbow": 1.0
      },
      "value_format": "Hidden",
      "description": "Flawless Build Provides Blueprint",
      "exclusive_droids": [
        "WG-22"
      ],
      "exclude_iconics": false,
      "stat": "WG22FlawlessCopy",
      "multiplier": false,
      "effect": "A flawless build provides a blueprint while WG-22 is equipped as a companion."
    },
    {
      "id": 24,
      "name": "Hyperdrive",
      "active_in": "Astromech",
      "values": {
        "Rainbow": 3.0
      },
      "value_format": "Hidden",
      "description": "3x CB-23 Mission Rewards",
      "exclusive_droids": [
        "CB-23"
      ],
      "exclude_iconics": false,
      "stat": null,
      "multiplier": false,
      "effect": "Triples CB-23's Upgrade Chip and Nova Crystal mission reward amounts. Reward weights do not change."
    },
    {
      "id": 25,
      "name": "Golden Splash Refill",
      "active_in": "Companion",
      "values": {
        "Rainbow": 1.0
      },
      "value_format": "Hidden",
      "description": "Gives Gold Splash / 2min While Hitting Depot",
      "exclusive_droids": [],
      "exclude_iconics": false,
      "stat": "GoldSplashRefill",
      "multiplier": false,
      "effect": "Refills Golden Splash while hitting a depot, with a 120-second cooldown."
    }
  ]
};
