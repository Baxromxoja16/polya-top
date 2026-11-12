# ADR-0006: Xabarnomalar — holatdan kelib chiqadigan triggerlar + BullMQ yetkazish navbati

- **Holat:** Qabul qilingan
- **Sana:** 2026-11-12
- **Bog'liq:** TZ 4.6, 7.6 (Transactional Outbox), ADR-0002

## Kontekst
TZ har bir domain event'ni Outbox'ga yozib, undan xabarnoma yuborishni nazarda tutgan. Amalda barcha MVP xabarnomalari ikki turga bo'linadi:
1. **Foydalanuvchi amali natijasi** (so'rov, tasdiq, rad, bekor): amal bajarilgan zahoti, o'sha so'rov ichida yuboriladi.
2. **Vaqt bo'yicha** (eslatma 2 soat oldin, so'rov muddati tugashiga 10 daqiqa qolgani, 21:00 dagi kunlik jadval, muddat o'tishi, yakunlanish): hammasi bandlov **holati va vaqti**dan to'liq aniqlanadi.

## Qaror
- **Yetkazish:** `TelegramMessenger` → BullMQ navbati (`tg-out`):
  - umumiy limit 25 xabar/s, bitta chatga 1 xabar/s (Redis `SET NX PX`);
  - 429 bo'lsa `retry_after`dan keyin, boshqa xatolarda eksponensial kutish bilan 5 marta;
  - 403 (bot bloklangan) qayta urinilmaydi, Identity'ga `onBlocked` orqali xabar beriladi (EC-T1).
- **Vaqt bo'yicha triggerlar — Outbox o'rniga holatdan:** `BookingSweeper` har `BOOKING_SWEEP_SECONDS` soniyada:
  - muddat va yakunlash — optimistic versiya bilan;
  - eslatma va Owner'ga eslatma — atomik flag (`remindedAt`, `ownerNudgedAt`: `null → now`, faqat shu chaqiruv qo'ygan yozuvlar yuboriladi);
  - kunlik jadval — Redis `SET NX` (`owner:sana` kaliti).
- Domain event'lar aggregate'larda saqlanib qoladi. Tashqi integratsiyalar (masalan, analitika yoki to'lov) paydo bo'lganda haqiqiy Outbox qo'shiladi.

## Oqibatlari
- ➕ Har bir xabarnoma **ko'pi bilan bir marta** yuboriladi va ko'p nusxada ham xavfsiz. Jarayon qayta ishga tushsa ham xabar yo'qolmaydi, chunki holat bazada.
- ➕ Alohida Outbox kolleksiyasi va dispatcher'ni qo'llab-quvvatlash shart emas.
- ➖ Foydalanuvchi amali natijasi (1-tur) navbatga qo'yilishidan oldin jarayon yiqilsa, o'sha xabar yo'qolishi mumkin. Bu holda ham ikkala tomonda boshqa tomonning raqami bor (BK-3), holat esa botda ko'rinadi.
- ➖ Sweeper davri (60 s) eslatma aniqligini ±1 daqiqaga cheklaydi.
