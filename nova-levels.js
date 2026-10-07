// Extend only uncapped upgrades; the exported rows remain the source for known levels.
export function novaLevelRow(upgrade, level) {
  const known = upgrade.levels.find(row => row.level === level);
  if (known) return known;
  if (!upgrade.uncapped || level < 1 || !Number.isSafeInteger(level)) return null;
  if (upgrade.repeatable) return {...upgrade.levels[0], level};
  const value = Number(upgrade.rewardPerLevel) * level;
  const rewards = {
    critChance: `+${value}% Critical Chance`, critAmount: `+${value}% Critical Amount`,
    creditPercent: `+${value}% Credits`, craftPercent: `+${value}% Droid Crafting Speed`,
    scrapSeconds: `${value} seconds of base Credit generation`
  };
  return {level, cost: upgrade.costBase + upgrade.costScale * (level - 1),
    reward: upgrade.id === 'fusion-speed' ? `+${level}/sec Droid fusion.` : rewards[upgrade.rewardType] || 'Reward not available'};
}

export function novaVisibleLevels(upgrade, owned) {
  const count = upgrade.uncapped && !upgrade.repeatable ? Math.max(50, owned) : upgrade.levels.length;
  return Array.from({length:count}, (_, index) => novaLevelRow(upgrade, index + 1));
}

export function novaTotalCost(upgrade, level = upgrade.levels.length) {
  if (upgrade.repeatable) return (Number(upgrade.levels[0]?.cost) || 0) * level;
  const known = Math.min(level, upgrade.levels.length);
  let total = upgrade.levels.slice(0, known).reduce((sum, row) => sum + (Number(row.cost) || 0), 0);
  if (upgrade.uncapped && level > known) {
    const count = level - known;
    total += count * upgrade.costBase + upgrade.costScale * count * (known + level - 1) / 2;
  }
  return total;
}
