import Decimal from 'decimal.js'

export const D = (value: Decimal.Value = 0) => new Decimal(value || 0)
export const money = (value: Decimal.Value = 0) => D(value).toDecimalPlaces(2).toFixed(2)
export const weight = (value: Decimal.Value = 0) => D(value).toDecimalPlaces(3).toFixed(3)

export function calcPureSilverWeight(netWeight: Decimal.Value, purity: Decimal.Value) {
  return weight(D(netWeight).mul(D(purity).div(1000)))
}

export function calcMakingCharge(
  baseMetalValue: Decimal.Value,
  netWeight: Decimal.Value,
  type: 'fixed' | 'perGram' | 'percentage',
  value: Decimal.Value,
) {
  const v = D(value)
  if (type === 'perGram') return money(D(netWeight).mul(v))
  if (type === 'percentage') return money(D(baseMetalValue).mul(v).div(100))
  return money(v)
}

export function calcSilverPrice(args: {
  netWeight: Decimal.Value
  purity: Decimal.Value
  ratePerPureGram: Decimal.Value
  makingType: 'fixed' | 'perGram' | 'percentage'
  makingValue: Decimal.Value
  stoneCost?: Decimal.Value
  otherCost?: Decimal.Value
}) {
  const pureWeight = D(args.netWeight).mul(D(args.purity).div(1000))
  const metalValue = pureWeight.mul(args.ratePerPureGram)
  const making = D(calcMakingCharge(metalValue, args.netWeight, args.makingType, args.makingValue))
  const total = metalValue.add(making).add(args.stoneCost || 0).add(args.otherCost || 0)
  return {
    pureWeight: weight(pureWeight),
    metalValue: money(metalValue),
    makingCharge: money(making),
    total: money(total),
  }
}
