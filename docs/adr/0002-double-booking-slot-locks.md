# ADR-0002: Double booking'ga qarshi — slot-lock kolleksiyasi va noyob indeks

- **Holat:** Qabul qilingan (amalga oshirish — 4-bosqich)
- **Sana:** 2026-11-11
- **Bog'liq:** TZ 4.4, 7.5, EC-B1a, EC-B1b

## Kontekst
Q1 qarori bo'yicha `PENDING` so'rovlar slotni egallamaydi, ular navbatga turadi. Poyga (race) **tasdiqlash** paytida yuzaga keladi: Owner va Staff bir vaqtda navbatdagi turli so'rovlarni tasdiqlashi, yoki qo'lda bandlov/blok kiritishi mumkin. Kafolat ilova kodiga emas, bazaga tayanishi kerak.

## Qaror
- `slot_locks` kolleksiyasi: `{ pitchId, slotStart, ownerType, ownerRefId }`, **unique index `{ pitchId: 1, slotStart: 1 }`**.
- Vaqt to'ri 1 soat (Q2). Bandlov `TimeRange.split(60)` bilan bo'laklanadi va har bir bo'lak uchun bitta lock yoziladi.
- Tasdiqlash, qo'lda bandlov va blok **bitta Mongo tranzaksiyasida** bajariladi: holat o'zgaradi, lock'lar yoziladi, kesishgan `PENDING`lar `REJECTED(SLOT_TAKEN)` qilinadi.
- `E11000 duplicate key` xatosi domain natijasiga aylantiriladi ("vaqt hozirgina boshqaga berildi").
- Bekor qilishda lock'lar xuddi shu tranzaksiyada o'chiriladi.
- **MongoDB replica set shart.** `ReplicaSetGuard` standalone Mongo bilan ilovani ishga tushirmaydi (e2e test bilan tekshirilgan).

## Ko'rib chiqilgan muqobillar
| Variant | Nega rad etildi |
|---|---|
| Redis lock (Redlock) | Mongo yozuvi bilan atomik emas; Redis yo'qolsa kafolat ham yo'qoladi |
| "Avval tekshir, keyin yoz" | Klassik race condition |
| Pitch hujjatida slot massivi | Hujjat cheksiz o'sadi, barcha yozuvlar bitta hujjatda to'qnashadi |
| Bandlovlar ustida `$expr` bilan overlap tekshirish | Unique constraint bermaydi, kafolat yo'q |

## Oqibatlari
- ➕ Kafolat baza darajasida: kodda xato bo'lsa ham double booking bo'lmaydi.
- ➕ Bandlov va blok bir xil mexanizmdan foydalanadi.
- ➖ Lokal muhitda ham replica set kerak (docker-compose buni avtomatik qiladi).
- ➖ To'r o'zgarsa (masalan, 30 daqiqa), lock'larni migratsiya qilish kerak bo'ladi.

## Amalga oshirishdan keyingi aniqlik (2026-11-12)
- **`withTransaction` avtomatik qayta urinishi ishlatilmaydi.** Bir slot uchun parallel tranzaksiyalar MongoDB'da `WriteConflict` (TransientTransactionError) beradi. Driver ularni 120 soniyagacha qayta urinadi: 50 ta parallel tasdiqlashda bu "retry bo'roni"ga aylanib, test 10 daqiqada ham tugamadi.
- Yechim — bitta urinishli tranzaksiya: lock qo'yishdagi `E11000` **yoki** `WriteConflict` → `SlotTakenError` (biznes natija: "vaqt boshqaga berildi"); bandlov hujjatidagi `WriteConflict` → `ConcurrencyConflictError`. Faqat `UnknownTransactionCommitResult` holatida commit qayta yuboriladi.
- Natija: 50 ta parallel tasdiqlash ~1 soniyada, aniq bitta g'olib bilan yakunlanadi (`test/booking/booking-store.e2e.spec.ts`).
