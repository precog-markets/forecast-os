// LS-LMSR pricing model and market math helpers used by quote.mjs.

export class LSLMSR {
  constructor(outcomes, alpha, initialShares = 0, sellFee = 0) {
    this.outcomes = outcomes;
    this.alpha = alpha;
    this.initialShares = initialShares;
    this.sellFee = sellFee;
    this.q = {};
    for (const outcome of outcomes) this.q[outcome] = this.initialShares;
    this.initialCost = this.cost();
    this.collectedFees = 0;
  }

  static fromState(outcomesBalances, alpha) {
    const outcomes = Object.keys(outcomesBalances);
    const initialShares = Math.min(...Object.values(outcomesBalances));
    const market = new LSLMSR(outcomes, alpha, initialShares);
    market.q = outcomesBalances;
    return market;
  }

  b(q = this.q) {
    return this.alpha * this.outcomes.reduce((sum, outcome) => sum + q[outcome], 0);
  }

  cost(q = this.q) {
    const bq = this.b(q);
    if (bq === 0) return 0;
    const sumExp = this.outcomes.reduce((sum, outcome) => sum + Math.exp(q[outcome] / bq), 0);
    return bq * Math.log(sumExp);
  }

  prices() {
    const result = {};
    for (const outcome of this.outcomes) {
      result[outcome] = this.tradeCost(outcome, 1);
    }
    return result;
  }

  trade(outcome, deltaQ) {
    const oldCost = this.cost();
    this.q[outcome] += deltaQ;
    const newCost = this.cost();
    return Math.abs(newCost - oldCost);
  }

  buy(outcome, shares) {
    return this.trade(outcome, Math.abs(shares));
  }

  sell(outcome, shares) {
    const tradeReturn = this.trade(outcome, -Math.abs(shares));
    const tradeFee = tradeReturn * this.sellFee;
    this.collectedFees += tradeFee;
    return tradeReturn - tradeFee;
  }

  tradeCost(outcome, deltaQ) {
    const tempQ = { ...this.q };
    tempQ[outcome] += deltaQ;
    const tradeCost = Math.abs(this.cost(tempQ) - this.cost(this.q));
    let tradeFee = 0;
    if (deltaQ < 0) tradeFee = tradeCost * this.sellFee;
    return tradeCost - tradeFee;
  }

  getBalances() {
    return { ...this.q };
  }

  getOutcome(outcomeIndex) {
    return this.outcomes[outcomeIndex - 1];
  }

  pricesAfterTrade(outcome, deltaQ) {
    const tempQ = { ...this.q };
    tempQ[outcome] += deltaQ;
    const result = {};
    for (const outcomeName of this.outcomes) {
      const qWithOneMore = { ...tempQ };
      qWithOneMore[outcomeName] += 1;
      result[outcomeName] = this.cost(qWithOneMore) - this.cost(tempQ);
    }
    return result;
  }

  maxSharesFromCost(outcome, budget, precision = 1e-9) {
    let low = 0;
    let high = 1;
    while (this.tradeCost(outcome, high) < budget) high *= 2;
    while (high - low > precision) {
      const mid = (low + high) / 2;
      const cost = this.tradeCost(outcome, mid);
      if (cost > budget) high = mid;
      else low = mid;
    }
    return low;
  }

  maxSharesFromPrice(outcome, targetPrice, precision = 1e-9) {
    let low = 0;
    let high = 1;
    while (true) {
      const price = this.pricesAfterTrade(outcome, high)[outcome];
      if (price >= targetPrice) break;
      high *= 2;
    }
    while (high - low > precision) {
      const mid = (low + high) / 2;
      const price = this.pricesAfterTrade(outcome, mid)[outcome];
      if (price > targetPrice) high = mid;
      else low = mid;
    }
    return low;
  }
}

const marketCost = (shares, alpha) => {
  const totalShares = shares.reduce((sum, share) => sum + share, 0);
  const beta = totalShares * alpha;
  const sumTotal = shares.reduce((sum, share) => (share === 0 ? sum : sum + Math.exp(share / beta)), 0);
  return beta * Math.log(sumTotal);
};

const marketCostAfterTrade = (shares, alpha, outcome, amount) => {
  const newShares = [...shares];
  newShares[outcome] += amount;
  return marketCost(newShares, alpha);
};

const marketTradeCost = (shares, alpha, outcome, amount) => {
  const cost = marketCost(shares, alpha);
  const costAfterTrade = marketCostAfterTrade(shares, alpha, outcome, amount);
  return Math.abs(costAfterTrade - cost);
};

export const marketSharesFromCost = (shares, alpha, outcome, totalCost) => {
  const maxIterations = 100;
  const tolerance = 0.0001;
  let low = totalCost * 0.999;
  let high = totalCost * 10000;
  let mid = 0;
  for (let i = 0; i < maxIterations; i += 1) {
    mid = (low + high) / 2;
    const cost = marketTradeCost(shares, alpha, outcome, mid);
    if (Math.abs(cost - totalCost) < tolerance) return mid;
    if (cost < totalCost) low = mid;
    else high = mid;
  }
  return mid;
};

export const marketPriceAfterTrade = (shares, alpha, outcome, amount) => {
  const costAfterTrade = marketCostAfterTrade(shares, alpha, outcome, amount);
  const oneShareDelta = amount > 0 ? amount + 1 : amount - 1;
  const costAfterTradeWithDelta = marketCostAfterTrade(shares, alpha, outcome, oneShareDelta);
  return Math.abs(costAfterTradeWithDelta - costAfterTrade);
};

export const getFuturePriceAfterTrade = (shares, alpha, outcome, tradeAmount) => {
  const sharesAfterTrade = [...shares];
  sharesAfterTrade[outcome] += tradeAmount;
  return marketTradeCost(sharesAfterTrade, alpha, outcome, 1);
};
