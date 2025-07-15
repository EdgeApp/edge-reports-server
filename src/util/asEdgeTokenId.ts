import { asEither, asNull, asString } from 'cleaners'

export type EdgeTokenId = string | null
export const asEdgeTokenId = asEither(asString, asNull)
