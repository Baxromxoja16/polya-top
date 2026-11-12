/**
 * Nominal tip: `UserId` va `VenueId` ikkalasi ham string, lekin bir-birining o'rniga
 * berib yuborilsa kompilyator xato beradi.
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };
