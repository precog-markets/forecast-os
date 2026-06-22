# Precog Liquidity And Creator Economics

Use this reference when a user asks how Precog creators earn, how LPs earn, how funding works, or what upside/risk exists for creating or funding a market.

## Resolution Waterfall

When a Precog market resolves:

1. Winning outcome traders are paid first.
2. Any money left over is the profit pool.
3. The profit pool is split: 90% to LPs, 5% to the market creator, and 5% to the protocol.

Current creator boost behavior: the protocol's 5% currently also goes to market creators through the creator boost program. Treat this as current program behavior, not a permanent guarantee.

## Creator Earnings

Market creators earn from the creator share of the post-payout profit pool. They do not need to provide upfront capital to create a market, though they may also LP in their own market if they want exposure to LP returns and risks.

Creator earnings scale with market engagement and profit-pool size. More trading can create more leftover profit, but earnings are not guaranteed. If the winning outcome is heavily bought or the market converges near certainty before close, little or no profit pool may remain.

## LP Earnings And Risks

LPs supply market liquidity and carry liquidity risk. LPs earn from 90% of the post-payout profit pool, plus trading fees when applicable. LP positions are locked until market resolution; there is no early exit.

Multi-outcome markets can improve profit potential by spreading trader bets across more outcomes. This can leave larger leftover profit when the winning outcome was underbet. Obvious markets that converge near certainty before close may leave little or no profit pool and can cause LP losses.

Funding remains a live financial action. ForecastOS may explain LP mechanics, but `fund_market` still requires explicit operator approval, Precog status `VALIDATED`, trusted wallet/action tooling, wallet policy readiness, EIP-712 signing, transaction signing/sending, and token approval if allowance is insufficient.

## Post-Resolution Claims

After resolution, standalone claim actions withdraw earned balances:

- **LP investment return** — LPs always claim funded collateral / investment through `claim_investment`.
- **Creator revenue share** — Creators claim when the market had revenue through `claim_investment` (same endpoint, creator wallet).
- **LP incentive bonus** — On incentivized markets, LPs claim bonus tokens earned from funding through `claim_incentive`. This is a separate token from main collateral; not available to creators.

Read `references/actions.md` and `references/action-policy.md` before preparing or submitting claims.

## Virtual Liquidity

Some Precog markets use virtual liquidity. In those markets, LPs deposit their Max Loss rather than the full curve depth. The same absolute max loss and payout mechanics apply, but less idle capital is locked, improving capital efficiency.

Virtual liquidity does not remove risk. It changes how much capital must be deposited to back the same market depth.
