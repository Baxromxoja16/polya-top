# Polya.top — Texnik Topshiriq (TZ)

|                  |                               |
| ---------------- | ----------------------------- |
| **Versiya**      | 1.0 (tasdiqlangan)            |
| **Sana**         | 2026-11-10                    |
| **Holat**        | ✅ Tasdiqlandi (2026-11-11)   |
| **Tasdiqlovchi** | Loyiha egasi (Lead Developer) |

> Belgilar: **[MVP]** — birinchi relizga kiradi, **[v2]** — keyingi bosqich, **[?]** — sizning qaroringiz kerak (11-bo'limda yig'ilgan).

---

## 1. Loyiha maqsadi

### 1.1 Muammo

- Futbol o'ynamoqchi bo'lgan odam stadionlarni tanishlar orqali, Instagram yoki Google Maps'dan qidiradi va telefon raqam topib, birma-bir qo'ng'iroq qiladi.
- Qaysi vaqt bo'sh ekani noma'lum, narxlar hamma joyda har xil, maydon holati (sun'iy maysa, chiroq, kiyinish xonasi, dush) haqida ishonchli ma'lumot yo'q.
- Stadion egasi bandlovni daftarda yoki xotirasida yuritadi. Natijada bitta vaqt ikki kishiga sotiladi, odam kelmay qoladi, bo'sh vaqtlar sotilmay qoladi.

### 1.2 Yechim

Barcha stadionlar, ularning bo'sh/band vaqtlari, narxlari, egasining kontakti va o'yinchilar sharhlari jamlangan yagona platforma. Birinchi interfeys — **Telegram bot**, keyin **Telegram Mini App / React web-app**.

### 1.3 Muvaffaqiyat mezonlari (KPI)

| Ko'rsatkich                               | MVP maqsadi (ishga tushgandan keyin 3 oy) |
| ----------------------------------------- | ----------------------------------------- |
| Ulangan stadionlar                        | ≥ 30 ta (1 shahar)                        |
| Bot orqali oyiga bandlovlar               | ≥ 1 000 ta                                |
| Ikki marta sotilgan vaqt (double booking) | **0** (texnik kafolat)                    |
| Bandlovni tasdiqlashgacha o'rtacha vaqt   | < 15 daqiqa                               |
| Bot javob vaqti (p95)                     | < 1 soniya                                |

---

## 2. Atamalar (Ubiquitous Language)

Kodda, bazada va hujjatda bir xil atamalar ishlatiladi.

| O'zbekcha                 | Kodda                       | Ma'nosi                                                                                                                         |
| ------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Shahar                    | `City`                      | Admin qo'shadigan shahar (MVP: faqat Olmaliq). Stadion va foydalanuvchi shunga bog'lanadi                                       |
| Hudud (tuman/mavze)       | `District`                  | Shahar ichidagi hudud, uni ham admin qo'shadi (ixtiyoriy)                                                                       |
| Orientir (stadion)        | `landmarkText`              | Owner yozadigan mo'ljal: "5-mikrorayon, 21-maktab orqasida"                                                                     |
| Orientirlar katalogi      | `Landmark`                  | Admin kiritadigan mashhur joylar (bozor, maktab, vokzal) koordinatasi bilan                                                     |
| Profil to'liqligi         | `Completeness`              | Stadion profili necha foiz to'ldirilgani (0–100%)                                                                               |
| Obuna / Premium           | `Subscription`              | Stadionning tarifi (FREE / PREMIUM) va amal qilish muddati                                                                      |
| Huquq tekshiruvi          | `FeatureGate`               | "Bu stadionda shu premium funksiya yoqilganmi?" degan tekshiruv                                                                 |
| Bo'shashini kutish        | `SlotWatch`                 | Band vaqtga obuna: bo'shasa xabar yuboriladi                                                                                    |
| Stadion / Kompleks        | `Venue`                     | Manzili, egasi va ish vaqti bor jismoniy joy. Unda bir nechta maydon bo'lishi mumkin                                            |
| Maydon (polya)            | `Pitch`                     | Bandlanadigan aniq maydon (masalan, "1-maydon, 40x20, sun'iy maysa")                                                            |
| Ish jadvali               | `Schedule`                  | Maydonning haftalik ish vaqti va istisnolari (bayram, ta'mir)                                                                   |
| Slot                      | `Slot`                      | Jadvaldan hisoblab chiqiladigan, bandlash mumkin bo'lgan vaqt bo'lagi (masalan, 19:00–20:00)                                    |
| Narx qoidasi              | `PricingRule`               | Kun/soatga qarab narx (kunduzi arzon, kechqurun qimmat, dam olish kunlari boshqa)                                               |
| Bandlov so'rovi / Bandlov | `Booking`                   | Foydalanuvchining maydondagi aniq vaqt oralig'iga buyurtmasi. `PENDING` holatida u **so'rov**, `CONFIRMED` bo'lgach **bandlov** |
| So'rovlar navbati         | `RequestQueue` (read-model) | Bitta vaqtga tushgan, hali tasdiqlanmagan so'rovlar; kelgan vaqti bo'yicha tartiblanadi                                         |
| Kontakt almashinuvi       | `ContactExchange`           | So'rov yuborilganda Player Owner raqamini, Owner esa Player raqamini oladi                                                      |
| Bloklash                  | `Block`                     | Ega tomonidan yopilgan vaqt (ta'mir, tashqi mijoz, o'z ehtiyoji)                                                                |
| Sharh                     | `Review`                    | O'ynagan foydalanuvchining baholashi va izohi                                                                                   |
| Holat haqida xabar        | `ConditionReport`           | Maydon holati haqida qisqa, tezkor ma'lumot ("bugun maysa ho'l", "chiroq ishlamayapti")                                         |
| Ega                       | `Owner`                     | Stadion egasi                                                                                                                   |
| Menejer                   | `Staff`                     | Egasi nomidan bandlovlarni boshqaradigan xodim                                                                                  |
| O'yinchi                  | `Player`                    | Oddiy foydalanuvchi                                                                                                             |

---

## 3. Rollar va ruxsatlar

| Rol           | Kim                                         | Asosiy imkoniyatlar                                                                                                                                                  |
| ------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Guest**     | Botni ochgan, telefonini hali bermagan odam | Stadionlarni ko'rish, qidirish, bo'sh vaqtlarni ko'rish                                                                                                              |
| **Player**    | Telefonini tasdiqlagan foydalanuvchi        | + bandlash, bekor qilish, sharh yozish, sevimlilar                                                                                                                   |
| **Owner**     | Stadion egasi (admin tasdiqlagan)           | + o'z stadion/maydonlarini boshqarish, jadval, narx, bandlovlarni tasdiqlash/rad etish, vaqt bloklash, qo'lda bandlov kiritish, sharhga javob berish, xodim qo'shish |
| **Staff**     | Owner taklif qilgan xodim                   | Owner ruxsat bergan amallar (bandlovlarni boshqarish, bloklash). Narx va stadionni o'chirish mumkin emas                                                             |
| **Moderator** | Platforma xodimi                            | Sharhlarni moderatsiya qilish, shikoyatlarni ko'rib chiqish                                                                                                          |
| **Admin**     | Platforma egasi                             | Hammasi: ownerlarni tasdiqlash, foydalanuvchini bloklash, statistika                                                                                                 |

**Qoidalar:**

- Bitta Telegram akkaunt bir nechta rolga ega bo'lishi mumkin: Owner o'zi ham Player bo'lib, boshqa stadionni bandlay oladi.
- Ruxsat har doim **resurs darajasida** tekshiriladi: Owner faqat o'z `Venue`sini boshqaradi, Staff faqat biriktirilgan `Venue`ni.
- RBAC + resurs egaligi (ABAC-lite) ishlatiladi. Ruxsatlar domain qatlamida emas, application qatlamida (policy/guard) tekshiriladi.

---

## 4. Funksional talablar

### 4.1 Identity (Foydalanuvchi) [MVP]

| ID   | Talab                                                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ID-1 | `/start` bosilganda foydalanuvchi `telegramId` bo'yicha yaratiladi yoki topiladi (idempotent)                                                                                              |
| ID-2 | Bandlashdan oldin telefon raqam **faqat Telegram "Kontaktni ulashish" tugmasi** orqali olinadi (`request_contact`). Qo'lda yozilgan raqam qabul qilinmaydi, chunki uni tasdiqlab bo'lmaydi |
| ID-3 | Ulashilgan kontaktning `user_id`si yuboruvchining `from.id`siga teng bo'lishi shart (birovning kontaktini yuborib bo'lmaydi)                                                               |
| ID-4 | Til tanlash: o'zbek (lotin), rus [MVP]; o'zbek (kirill), ingliz [v2]                                                                                                                       |
| ID-5 | Profil: ism (Telegram'dan, tahrirlash mumkin), telefon, til, shahar. Shahar **faqat ro'yxatdan tanlanadi** (4.2.1). Faol shahar bitta bo'lsa, u avtomatik tanlanadi va so'ralmaydi         |
| ID-6 | Foydalanuvchi botni bloklasa, `isBotBlocked=true` belgilanadi va xabarnomalar to'xtatiladi; qayta `/start` bosilsa belgi olib tashlanadi                                                   |
| ID-7 | Mini App/web uchun autentifikatsiya: Telegram `initData` HMAC tekshiruvi → JWT (access 15 daqiqa + refresh 30 kun) [v2, lekin arxitektura hozirdan tayyor]                                 |

### 4.2 Venue Catalog (Stadionlar katalogi) [MVP]

| ID    | Talab                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| VC-1  | **Avval Owner, keyin stadion** (Q6). Owner ro'yxatdan o'tish arizasini beradi, admin tasdiqlaydi. Shundan keyingina Owner o'z stadionlarini qo'sha oladi. Har bir yangi stadion admin tasdiqlaguncha `PENDING_REVIEW` holatida bo'ladi va qidiruvda chiqmaydi. **Owner'i yo'q stadion katalogda umuman bo'lmaydi**                                                                                                                                                                                                                                     |
| VC-2  | **Sodda onboarding (Q13).** Stadion yaratish uchun faqat quyidagilar so'raladi, hammasi bitta oqimda: <br>1) **Polya nomi** <br>2) **Orientir** (matn, masalan "5-mikrorayon, 21-maktab orqasida") <br>3) **Ish vaqti**: tayyor tugmalar `08:00–00:00` / `16:00–02:00` / `Boshqa`; har kuni bir xil deb olinadi <br>4) **Soatlik narx**: bitta raqam, barcha soatlarga bir xil <br>Shahar faol shahar bitta bo'lsa avtomatik qo'yiladi. Kontakt telefon Owner'ning tasdiqlangan raqamidan avtomatik olinadi. **Lokatsiya ham, rasm ham majburiy emas** |
| VC-2a | Stadion yaratilganda **"1-maydon" avtomatik** yaratiladi (standart sozlamalar bilan), ish vaqti va narx ham unga bog'lanadi. Qo'shimcha maydonlar keyin qo'shiladi                                                                                                                                                                                                                                                                                                                                                                                     |
| VC-2b | Qolgan barcha ma'lumotlar keyin, **tahrirlash** orqali kiritiladi: rasmlar, lokatsiya, hudud, tavsif, qo'shimcha telefonlar (≤3), qulayliklar (parkovka, dush, kiyinish xonasi, kafe, tribuna), maydon formati/qoplamasi/o'lchami, yopiq/ochiq, chiroq, kun va soatga qarab narx, hafta kunlari bo'yicha alohida jadval                                                                                                                                                                                                                                |
| VC-2c | **Profil to'liqligi:** majburiy 4 ta maydon to'ldirilganda **30%**; rasm +20%, lokatsiya +20%, qulayliklar +10%, maydon tafsilotlari (format, qoplama) +10%, tavsif +10%. Owner panelida "Profilingiz 30% to'ldirilgan. Rasm qo'shing, +20%" degan maslahat ko'rsatiladi. To'liqlik qidiruv saralashiga kichik ta'sir qiladi                                                                                                                                                                                                                           |
| VC-2d | Lokatsiyasi yo'q stadion "yaqin atrofda" qidiruvida masofasiz, ro'yxat oxirida chiqadi. Admin tasdiqlash paytida lokatsiyani o'zi qo'ya oladi                                                                                                                                                                                                                                                                                                                                                                                                          |
| VC-2e | Rasmlar soni: FREE — 5 ta, PREMIUM — 15 ta + video (4.9)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| VC-3  | Pitch maydonlari: nomi, o'lchami (masalan, 40x20), qoplama turi (sun'iy maysa / tabiiy / parket / rezina), formati (5x5, 6x6, 7x7, 11x11), yopiq/ochiq, chiroq bor/yo'q, rasmlar, holati (`ACTIVE`/`MAINTENANCE`/`ARCHIVED`)                                                                                                                                                                                                                                                                                                                           |
| VC-4  | Qidiruv usullari: <br>(a) **eng yaqin**: foydalanuvchi lokatsiyasi orqali (`$geoNear`, radius filtri) <br>(b) **hudud bo'yicha** (ro'yxatdan) <br>(c) **erkin matn**: nomi, orientiri va hududi bo'yicha (VC-4a) <br>(d) **orientirlar katalogi**: Admin kiritgan joyni tanlash ("Markaziy bozor") → shu nuqtaga eng yaqin stadionlar (VC-4b)                                                                                                                                                                                                          |
| VC-4a | **Matnli qidiruvni normallashtirish:** kirill ↔ lotin (`Алмалык` = `olmaliq`); apostroflar (`o'`, `oʻ`, `o‘`, `o`) bir xil; katta-kichik harf farqsiz; raqam+so'z ajratish (`21maktab` = `21-maktab`); sinonimlar lug'ati (`maktab`=`shkola`=`школа`, `polya`=`stadion`=`maydon`=`поле`, `bozor`=`rynok`). Stadionda `searchText` maydoni saqlanadi va venue o'zgarganda qayta hisoblanadi. Sinonimlar lug'atini Admin to'ldirib boradi                                                                                                                |
| VC-4b | **Orientirlar katalogi (`Landmark`)**: Admin shahar bo'yicha mashhur joylarni nomi (uz/ru), sinonimlari va koordinatasi bilan kiritadi. Foydalanuvchi matnda orientir nomini yozsa ham (`bozor yonida`), u katalogdan topiladi va qidiruv **matn + geo** sifatida bajariladi: nomida "bozor" bo'lmagan, lekin bozorga yaqin stadion ham chiqadi                                                                                                                                                                                                        |
| VC-4c | Qidiruv kodi `VenueSearchPort` interfeysi ortida. MVP adapteri — MongoDB (`searchText` + 2dsphere). Hajm oshganda **Meilisearch** (self-hosted, xatolarga chidamli) adapteri bilan almashtiriladi, boshqa kod o'zgarmaydi                                                                                                                                                                                                                                                                                                                              |
| VC-5  | Filtrlar (barchasi tugmalar bilan, raqam yozish shart emas): sana+vaqt ("bugun 20:00 da bo'sh"), davomiylik, narx oralig'i (`100 mingacha` / `100–200 ming` / `200+`), format (5x5…11x11), yopiq/ochiq, chiroq, qulayliklar                                                                                                                                                                                                                                                                                                                            |
| VC-5a | Saralash: masofa / narx / reyting / "tavsiya etiladi" (standart: tanlangan vaqtda bo'shlari, keyin masofa). Premium stadionlar faqat **"⭐ Tavsiya etiladi"** belgisi bilan yuqorida chiqadi va har sahifada ko'pi bilan 2 ta bo'ladi (4.9)                                                                                                                                                                                                                                                                                                            |
| VC-5b | ⚡ **"Hozir bo'sh"** tugmasi: keyingi 3 soat ichida bo'sh polyalar, bitta bosish bilan                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| VC-5c | 🔁 **"Yana bandlash"**: "Mening bandlovlarim"da o'tgan bandlov yonida tugma bo'ladi; u xuddi shu polyada keyingi haftaning shu kuni va vaqtiga so'rov oqimini to'ldirilgan holda ochadi                                                                                                                                                                                                                                                                                                                                                                |
| VC-5d | 🔔 **"Bo'shasa xabar ber" (`SlotWatch`)**: band (🔴) vaqtga obuna bo'lish. Bandlov bekor qilinsa, obunachilarga **obuna bo'lgan tartibida** xabar boriladi (bir vaqtda hammasiga emas; birinchisiga, 10 daqiqadan keyin ikkinchisiga). Bir foydalanuvchida ko'pi bilan 5 ta faol obuna; obuna o'yin vaqti o'tgach o'chadi                                                                                                                                                                                                                              |
| VC-5e | Matnli tabiiy so'rov ("ertaga 20 da yopiq 6x6") — sana, vaqt va filtrlarni avtomatik ajratish [v2]                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| VC-5f | Xaritada ko'rish (Mini App) [v2]; guruh chatida `@bot` inline qidiruv [v2]                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| VC-6  | **Asosiy ssenariy — "Hozir/bugun bo'sh":** foydalanuvchi vaqtni tanlaydi va shu vaqtda bo'sh maydonlar masofa bo'yicha tartiblanib chiqadi                                                                                                                                                                                                                                                                                                                                                                                                             |
| VC-7  | Stadion kartochkasi: rasmlar, manzil (Telegram location yuboriladi), telefon (bosilsa qo'ng'iroq), reyting, oxirgi sharhlar, maydonlar ro'yxati, narxlar                                                                                                                                                                                                                                                                                                                                                                                               |
| VC-8  | Sevimlilar ro'yxati [MVP]                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| VC-9  | Stadionni arxivlash (o'chirmasdan). Kelajakdagi faol bandlovlari bo'lsa, avval ularni hal qilish so'raladi (12-bo'lim, EC-V3)                                                                                                                                                                                                                                                                                                                                                                                                                          |

### 4.2.1 Shaharlar katalogi (Q9) [MVP]

| ID   | Talab                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CT-1 | Shaharlarni **faqat Admin** qo'shadi, tahrirlaydi va faollashtiradi/o'chiradi. MVP'da bitta shahar bor: **Olmaliq**                                           |
| CT-2 | Shahar maydonlari: nomi (uz, ru), `slug`, `timezone` (standart `Asia/Tashkent`), markaz koordinatasi, xarita chegarasi (ixtiyoriy), `isActive`, tartib raqami |
| CT-3 | Hududlar (`District`) shahar ichida, ularni ham Admin qo'shadi. Owner stadion qo'shganda hududni ro'yxatdan tanlaydi                                          |
| CT-4 | Owner va Player shaharni **faqat ro'yxatdan** tanlaydi (botda inline tugmalar, web'da dropdown). Erkin matn qabul qilinmaydi                                  |
| CT-5 | Qidiruv har doim foydalanuvchi tanlagan shahar doirasida bo'ladi. Shaharni sozlamalarda almashtirish mumkin                                                   |
| CT-6 | Venue `timezone`ni o'z shahridan oladi                                                                                                                        |
| CT-7 | Shahar katalogi Venue Catalog kontekstining bir qismi (alohida `Geography` moduli sifatida ajratiladi), Admin buni bot orqali boshqaradi                      |

### 4.3 Schedule & Pricing (Jadval va narx) [MVP]

| ID   | Talab                                                                                                                                                                                                                                                                                  |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SP-1 | Haftalik jadval: har bir hafta kuni uchun ish oraliqlari (masalan, Du–Ju 08:00–02:00). **Yarim tundan o'tadigan oraliq** qo'llab-quvvatlanadi                                                                                                                                          |
| SP-2 | Istisnolar (`ScheduleException`): aniq sana uchun yopiq kun yoki boshqa ish vaqti (bayram, ta'mir)                                                                                                                                                                                     |
| SP-3 | **Vaqt to'ri — 1 soat** (Q2, A variant). O'yin faqat butun soatda boshlanadi (18:00, 19:00…). Davomiylik butun soatlarda: 1, 2, 3 soat, eng kami 1 soat. Maydonda `slotSizeMin = 60` maydoni saqlanadi, shuning uchun keyinchalik to'rni o'zgartirish mumkin, lekin MVP'da u qat'iy 60 |
| SP-4 | Narx qoidalari: kun turi (ish kuni / dam olish kuni / aniq sana) + soat oralig'i → soatlik narx (so'mda). Qoidalar ustuvorligi: aniq sana > hafta kuni > standart                                                                                                                      |
| SP-5 | Bandlov narxi bandlov **yaratilgan paytda hisoblanadi va saqlanadi** (snapshot). Keyin narx o'zgarsa, eski bandlovlarga ta'sir qilmaydi                                                                                                                                                |
| SP-6 | Bandlash ufqi: necha kun oldindan bandlash mumkinligi (standart 14 kun, Owner sozlaydi)                                                                                                                                                                                                |
| SP-7 | Minimal oldindan bandlash vaqti: o'yin boshlanishidan kamida N daqiqa oldin (standart 30 daqiqa)                                                                                                                                                                                       |
| SP-8 | Bo'sh slotlar **saqlanmaydi, hisoblanadi**: `Availability = Jadval − Istisnolar − Faol bandlovlar − Bloklar`                                                                                                                                                                           |

### 4.4 Booking (Bandlov) — asosiy bounded context [MVP]

| ID    | Talab                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BK-1  | Player maydon, sana va ketma-ket slot(lar)ni tanlaydi, xulosani ko'radi (vaqt, narx, manzil, bekor qilish qoidasi) va tasdiqlaydi                                                                                                                                                                                                                                                                                                                               |
| BK-2  | **Tasdiqlash har doim qo'lda, Owner/Staff tomonidan** (Q1). Avtomatik tasdiqlash yo'q. "Bandlash" bosilganda `PENDING` so'rov yaratiladi                                                                                                                                                                                                                                                                                                                        |
| BK-3  | **Kontakt almashinuvi:** so'rov yaratilishi bilan **ikki tomon ham bir-birining raqamini oladi**. Player'ga Owner/venue raqami (bosilsa qo'ng'iroq bo'ladi) va "Egasi siz bilan bog'lanadi yoki o'zingiz qo'ng'iroq qiling" degan xabar boradi. Owner va barcha Staff'ga Player ismi, raqami, reputatsiyasi va bandlov tafsilotlari boradi. Ular telefonda kelishib oladi, keyin Owner botda tasdiqlaydi                                                        |
| BK-3a | **`PENDING` slotni egallamaydi.** Bitta vaqtga bir nechta so'rov tushishi mumkin: ular **navbat** bo'lib, kelgan vaqti bo'yicha tartiblanadi. Slotni faqat `CONFIRMED` egallaydi                                                                                                                                                                                                                                                                                |
| BK-3b | Band bo'lmagan, lekin so'rovi bor vaqtga yangi so'rov tushsa, **Owner va Staff'ga ikkala so'rov birga** yuboriladi: _"Bu vaqtga avval Ali (+998 90 …, 18:05 da) so'rov qoldirgan, hali tasdiqlanmagan. Avval u bilan bog'laning. Agar u bandlamasa, yangi so'rovni qabul qiling."_ Har bir so'rov uchun alohida `✅ Tasdiqlash` / `❌ Rad etish` tugmalari bo'ladi. Owner navbatdan istalganini tasdiqlay oladi (birinchisi telefonni ko'tarmasa, ikkinchisini) |
| BK-3c | Bitta so'rov tasdiqlanganda, u bilan vaqti **kesishadigan** barcha `PENDING` so'rovlar avtomatik `REJECTED` (sabab: `SLOT_TAKEN`) bo'ladi va ularning egalariga "Bu vaqt boshqa o'yinchiga berildi" degan xabar va muqobil bo'sh vaqtlar yuboriladi                                                                                                                                                                                                             |
| BK-3d | Player so'rov yuborayotganda navbatni ko'radi: _"Bu vaqtga allaqachon 1 ta so'rov bor. Siz navbatda 2-chisiz. Egasi avval birinchi o'yinchi bilan gaplashadi."_ Shundan keyin u davom etishi yoki boshqa vaqtni tanlashi mumkin                                                                                                                                                                                                                                 |
| BK-3e | Bitta slotdagi navbat cheklangan: ko'pi bilan **3 ta** faol so'rov (Q2a). Undan keyin "Bu vaqtga so'rovlar ko'p, boshqa vaqt tanlang" deb javob beriladi                                                                                                                                                                                                                                                                                                        |
| BK-3f | So'rov muddati: `expiresAt = min(createdAt + TTL, startAt)` (TTL standart 60 daqiqa, Owner sozlaydi). Muddat tugashidan 10 daqiqa oldin Owner'ga eslatma boradi. Muddat tugasa `EXPIRED` bo'ladi va Player'ga xabar yuboriladi                                                                                                                                                                                                                                  |
| BK-4  | Owner rad etsa, sababini tanlaydi yoki yozadi; Player xabar oladi                                                                                                                                                                                                                                                                                                                                                                                               |
| BK-5  | Player bekor qilishi: o'yinga ≥ N soat (standart 3) qolganda erkin; kamroq qolganda ham mumkin, lekin "kech bekor qilish" sifatida qayd qilinadi (reputatsiyaga ta'sir qiladi)                                                                                                                                                                                                                                                                                  |
| BK-6  | Owner tasdiqlangan bandlovni bekor qilishi mumkin, faqat sabab bilan; Player darhol xabar oladi                                                                                                                                                                                                                                                                                                                                                                 |
| BK-7  | Owner **qo'lda bandlov** kiritadi (to'g'ridan-to'g'ri qo'ng'iroq qilgan mijoz uchun): ism + telefon (ixtiyoriy). Bunday bandlov darhol `CONFIRMED` bo'ladi. U ham xuddi tasdiqlash kabi ishlaydi: slotni egallaydi va kesishadigan `PENDING` so'rovlarni `SLOT_TAKEN` bilan rad etadi. Saqlashdan oldin Owner'ga "Bu vaqtga N ta kutilayotgan so'rov bor, ular rad etiladi" ogohlantirishi ko'rsatiladi                                                         |
| BK-8  | Owner **vaqtni bloklaydi** (ta'mir, o'z ehtiyoji). Bu bandlov emas, lekin slotni egallaydi. Kesishadigan `PENDING` so'rovlar bilan xuddi BK-7 dagidek ishlanadi                                                                                                                                                                                                                                                                                                 |
| BK-9  | O'yin tugagach, bandlov avtomatik `COMPLETED` bo'ladi. Owner 24 soat ichida `NO_SHOW` deb belgilashi mumkin                                                                                                                                                                                                                                                                                                                                                     |
| BK-10 | **Takroriy bandlov** (har seshanba 20:00, N hafta) — har bir sana alohida `Booking`, bitta `seriesId` bilan bog'lanadi [v2]                                                                                                                                                                                                                                                                                                                                     |
| BK-11 | Bitta Player uchun bir vaqtda faol `PENDING` bandlovlar soni cheklangan (standart 3) — spam va "hamma slotni egallab qo'yish"ning oldini olish uchun                                                                                                                                                                                                                                                                                                            |
| BK-12 | Player "Mening bandlovlarim": kelgusi / o'tgan, har biri uchun holat va amallar                                                                                                                                                                                                                                                                                                                                                                                 |
| BK-13 | Owner "Bugungi jadval": barcha maydonlar bo'yicha bugungi bandlovlar va bloklar ko'rinishi                                                                                                                                                                                                                                                                                                                                                                      |
| BK-14 | Oldindan to'lov / depozit (Click, Payme, Uzum) [v2]. MVP'da to'lov joyida, platforma pulga tegmaydi                                                                                                                                                                                                                                                                                                                                                             |

#### 4.4.1 Bandlov holatlari (State Machine)

```
                 ┌── owner rad etdi ───────────────► REJECTED (reason: OWNER)
                 ├── boshqa so'rov tasdiqlandi ────► REJECTED (reason: SLOT_TAKEN)
                 │
   [create] ──► PENDING ── timeout ─────────────────► EXPIRED
                 │  │
                 │  └──── player bekor qildi ───────► CANCELLED_BY_PLAYER
                 │
        owner/staff tasdiqladi (slot-lock olinadi)
                 ▼
             CONFIRMED ── player bekor qildi ───────► CANCELLED_BY_PLAYER
                 │   └─── owner bekor qildi ────────► CANCELLED_BY_OWNER
                 │
           o'yin vaqti tugadi
                 ▼
             COMPLETED ── owner 24 soat ichida ─────► NO_SHOW
```

- **Slotni egallaydigan holat — faqat `CONFIRMED`** (va qo'lda bandlov hamda bloklar). `PENDING` slotni egallamaydi, u faqat navbatda turadi.
- Foydalanuvchiga slot uch xil ko'rinishda ko'rsatiladi: 🟢 **Bo'sh**, 🟡 **So'rov bor (N)**: bandlash mumkin, lekin navbatga turasiz, 🔴 **Band**.
- Har bir o'tish **domain event** chiqaradi (`BookingCreated`, `BookingConfirmed`, `BookingRejected`, `BookingExpired`, `BookingCancelled`, `BookingCompleted`, `BookingMarkedNoShow`).
- Ruxsat etilmagan o'tish (masalan, `REJECTED → CONFIRMED`) domain xatosini qaytaradi.

### 4.5 Reviews & Condition (Sharhlar va maydon holati) [MVP]

| ID   | Talab                                                                                                                                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RV-1 | Sharhni faqat **shu maydonda `COMPLETED` bandlovi bo'lgan** Player yoza oladi. 1 bandlov = ko'pi bilan 1 sharh                                                                                                                              |
| RV-2 | Sharh: umumiy baho (1–5) + mezonlar (maysa holati, chiroq, kiyinish xonasi/dush, xizmat, narx-sifat) + matn (≤ 1000 belgi) + rasm (≤ 3) [rasm — v2]                                                                                         |
| RV-3 | O'yindan 2 soat o'tgach bot sharh qoldirishni taklif qiladi (bir marta)                                                                                                                                                                     |
| RV-4 | Sharhni 7 kun ichida tahrirlash mumkin; o'chirish — istalgan vaqtda (soft delete)                                                                                                                                                           |
| RV-5 | Owner har bir sharhga 1 marta ochiq javob yoza oladi                                                                                                                                                                                        |
| RV-6 | Shikoyat qilish (haqorat, spam, yolg'on) → Moderatorga navbat. 3+ shikoyat bo'lsa, sharh moderatsiyagacha avtomatik yashiriladi                                                                                                             |
| RV-7 | Venue/Pitch reytingi — o'rtacha baho va sharhlar soni, **denormalizatsiya** qilinib saqlanadi va event orqali yangilanadi                                                                                                                   |
| RV-8 | **Maydon holati haqida xabar (`ConditionReport`)**: so'nggi 24 soatda o'ynagan Player yoki Owner qisqa holat qoldiradi ("maysa ho'l", "chiroq yarim ishlayapti"). U 48 soatdan keyin eskiradi va kartochkada "So'nggi holat" bo'lib chiqadi |

### 4.6 Notifications (Xabarnomalar) [MVP]

| Hodisa                                    | Kimga                              | Kanal                                                                                                                     |
| ----------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Yangi so'rov (PENDING)                    | Owner + **barcha** Staff           | Bot: Player ismi, **raqami**, reputatsiyasi va "Tasdiqlash / Rad etish" tugmalari                                         |
| Yangi so'rov, lekin shu vaqtda navbat bor | Owner + barcha Staff               | Bot: **navbatdagi barcha so'rovlar birga**, BK-3b matni, har biri uchun tugmalar                                          |
| So'rov qabul qilindi (yaratildi)          | Player                             | Bot: Owner/venue **raqami**, navbatdagi o'rni, "Egasi siz bilan bog'lanadi"                                               |
| Bitta so'rov tasdiqlandi                  | Boshqa Owner/Staff'lar             | Ularga kelgan xabar tahrirlanadi: "✅ Ali tomonidan tasdiqlangan", tugmalar olib tashlanadi                               |
| Tasdiqlandi / Rad etildi / Muddati o'tdi  | Player                             | Bot                                                                                                                       |
| Vaqt boshqaga berildi (SLOT_TAKEN)        | Navbatdagi boshqa Player'lar       | Bot + muqobil bo'sh vaqtlar                                                                                               |
| Bekor qilindi                             | Qarshi tomon                       | Bot                                                                                                                       |
| O'yin eslatmasi                           | Player                             | Bot, 2 soat oldin (sozlanadi)                                                                                             |
| Kunlik ertangi jadval                     | Owner                              | Bot, har kuni 21:00 (Owner sozlamada o'chirib qo'yishi mumkin)                                                            |
| Sharh taklifi                             | Player                             | Bot, o'yindan 2 soat keyin                                                                                                |
| Yangi sharh                               | Owner                              | Bot                                                                                                                       |
| Kutilgan vaqt bo'shadi (`SlotWatch`)      | Obunachi Player'lar (navbat bilan) | Bot + "Bandlash" tugmasi                                                                                                  |
| 🆕 **Yangi polya ochildi** (marketing)    | Shu shahardagi barcha Player'lar   | Bot: nom, orientir, narx, rasm (bo'lsa), "Ko'rish / Bandlash" tugmalari. **Tekin**, har bir stadion uchun bir marta (Q14) |
| 🔥 Bo'sh soatga chegirma (marketing)      | Shu shahardagi Player'lar          | **Faqat PREMIUM** (4.9)                                                                                                   |
| Doimiy mijozlarga xabar (marketing)       | Shu stadionda o'ynagan Player'lar  | **Faqat PREMIUM** (4.9)                                                                                                   |
| PENDING muddati tugashiga 10 daqiqa qoldi | Owner + Staff                      | Bot (qayta eslatma)                                                                                                       |

- Xabarnomalar **navbat (queue) orqali** asinxron yuboriladi. Domain tranzaksiyasi muvaffaqiyatli tugagandan keyingina yuboriladi (**Transactional Outbox**).
- Telegram limitlariga rioya qilinadi (umumiy ~30 xabar/s, bitta chatga 1 xabar/s) — rate limiter + 429 bo'lganda `retry_after` bo'yicha qayta urinish.
- Xabarnoma yuborilmasa, bandlov jarayoni to'xtamaydi (xabarnoma — yon ta'sir, asosiy logika emas).

#### 4.6.1 Marketing xabarlari qoidalari (spamga qarshi) [MVP]

Ko'p reklama bo'lsa, foydalanuvchi botni bloklaydi va unga bandlov xabarlari ham yetib bormaydi. Shuning uchun quyidagi qoidalar **domain darajasidagi** cheklov sifatida kiritiladi:

| ID   | Qoida                                                                                                                                                                                                                  |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MK-1 | Marketing va tranzaksion xabarlar alohida turlar. Tranzaksion xabarlarga (bandlov, eslatma) cheklov **qo'llanmaydi**                                                                                                   |
| MK-2 | Bitta foydalanuvchiga **haftasiga ko'pi bilan 2 ta** marketing xabari boradi. Limit to'lsa, xabar keyingi haftaga qoldirilmaydi, tashlab yuboriladi                                                                    |
| MK-3 | Marketing xabarlari faqat shahar vaqti bilan **10:00–21:00** orasida yuboriladi. Undan tashqari vaqtga to'g'ri kelsa, ertalab 10:00 ga suriladi (chegirma e'loni bundan mustasno: muddati o'tib ketsa, bekor qilinadi) |
| MK-4 | Har bir marketing xabarida `🔕 Bunday xabarlarni o'chirish` tugmasi bo'ladi. Sozlamalarda qayta yoqish mumkin (`marketingOptOut`)                                                                                      |
| MK-5 | "Yangi polya ochildi" e'loni faqat stadion **admin tasdiqlagandan keyin** yuboriladi va bandlash ishlashi kerak (ish vaqti + narx bor). Har bir stadion uchun **bir marta**                                            |
| MK-6 | Yuborish navbat orqali, Telegram limitlariga rioya qilgan holda (≤ 25 xabar/s), bo'laklab amalga oshiriladi                                                                                                            |
| MK-7 | Har bir kampaniya uchun statistika: yuborildi / yetkazildi / bosildi / bloklandi. Bloklash ulushi > 2% bo'lsa, Admin'ga ogohlantirish yuboriladi                                                                       |

### 4.7 Administration [MVP — minimal]

| ID   | Talab                                                                         |
| ---- | ----------------------------------------------------------------------------- |
| AD-1 | Owner arizalarini tasdiqlash/rad etish (bot ichida, admin chat orqali)        |
| AD-2 | Foydalanuvchi/Venue'ni bloklash                                               |
| AD-3 | Sharh moderatsiyasi navbati                                                   |
| AD-4 | Asosiy statistika: foydalanuvchilar, venue'lar, kunlik bandlovlar, konversiya |
| AD-5 | To'liq web admin panel [v2]                                                   |

### 4.8 Reputatsiya va suiiste'molga qarshi himoya [MVP — minimal]

- Player hisoblagichlari: `completedCount`, `noShowCount`, `lateCancelCount`.
- Owner bandlov so'rovida Player reputatsiyasini ko'radi ("12 marta o'ynagan, 1 marta kelmagan").
- Chegaralar: 3 ta `NO_SHOW` (90 kun ichida) bo'lsa, Owner'ga so'rov "⚠️ Ishonchsiz o'yinchi" belgisi bilan boradi. 5 ta bo'lsa, 30 kunga bandlash huquqi to'xtatiladi.
- Owner tomoni: tez-tez bekor qilish yoki javob bermaslik → admin ogohlantirishi; javob berish tezligi kartochkada ko'rinadi [v2].

### 4.9 Subscription & Premium (Q15, Q16)

**Tamoyillar:**

- Pul faqat **Owner'dan** olinadi. Player uchun hamma narsa tekin.
- Ishga tushirishda **barcha Owner'larga 3 oy PREMIUM tekin** beriladi va ular "Asoschi hamkor" statusini oladi. Muddat tugashidan 7 kun va 1 kun oldin eslatma yuboriladi.
- Arxitekturada `Subscription` alohida bounded context bo'ladi. Har bir premium funksiya `FeatureGate.can(venueId, feature)` orqali tekshiriladi, funksiyalar kodda `if (premium)` bilan sochilib ketmaydi. Tariflar va ularning funksiyalari konfiguratsiyada (`Plan → Feature[] + limitlar`) saqlanadi, shuning uchun yangi tarif qo'shish kodni o'zgartirmaydi.
- MVP'da to'lov **qo'lda**: Owner Click/Payme orqali to'laydi, Admin botda obunani yoqadi yoki uzaytiradi. Avtomatik to'lov integratsiyasi — v2.
- Narx (so'mda) Olmaliqdagi Owner'lar bilan suhbatdan keyin aniqlanadi va konfiguratsiyada saqlanadi.

| Funksiya                                                                                 | FREE                    | PREMIUM                                                              | Bosqich          |
| ---------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------- | ---------------- |
| Katalogda chiqish, so'rovlar, tasdiqlash, qo'lda bandlov, bloklash                       | ✅                      | ✅                                                                   | MVP              |
| 🆕 "Yangi polya ochildi" e'loni (bir marta)                                              | ✅                      | ✅                                                                   | MVP              |
| 🔥 **Bo'sh soatga chegirma e'loni** (masalan, "Bugun 14:00–17:00, −20%") shahar bo'yicha | ❌                      | ✅ oyiga 4 ta                                                        | MVP              |
| ⭐ **Qidiruvda "Tavsiya etiladi"** (VC-5a)                                               | ❌                      | ✅                                                                   | MVP              |
| 📊 Statistika                                                                            | Oddiy (bandlovlar soni) | To'liq: bandlik %, gavjum soatlar, taxminiy daromad, doimiy mijozlar | MVP              |
| 👥 Doimiy mijozlar bazasi + ularga xabar                                                 | ❌                      | ✅ oyiga 2 ta                                                        | v2               |
| 🔁 Takroriy bandlov (BK-10)                                                              | ❌                      | ✅                                                                   | v2               |
| Xodimlar (Staff)                                                                         | 1 ta                    | Cheksiz                                                              | MVP              |
| Rasmlar                                                                                  | 5 ta                    | 15 ta + video                                                        | MVP (video — v2) |
| 💳 Oldindan to'lov / depozit                                                             | ❌                      | ✅                                                                   | v2               |
| Excel eksport, kunlik hisobot                                                            | ❌                      | ✅                                                                   | v2               |

**Chegirma e'loni (`Promotion`) qoidalari:**

- Faqat kelgusi 24 soat ichidagi **bo'sh** slotlarga beriladi. Chegirma 10–50% oralig'ida bo'ladi.
- E'lon qilingan chegirmali narx so'rov yaratilganda narx snapshot'iga yoziladi (SP-5).
- Chegirmali slot band bo'lib qolsa, e'londagi "Bandlash" tugmasi "Band bo'ldi" deb javob beradi.
- MK-1…MK-7 qoidalari chegirma e'loniga ham qo'llanadi (premium spamga ruxsat bermaydi).

---

## 5. Telegram bot UX

### 5.1 Asosiy menyu (Player)

```
⚽ Bo'sh maydon topish
📍 Yaqin atrofdagi stadionlar
📅 Mening bandlovlarim
⭐ Sevimlilar
⚙️ Sozlamalar (til, telefon)
🏟 Stadion egasiman   ← Owner bo'lmaganlarga ariza, Ownerlarga panel
```

### 5.2 Asosiy oqim: "Bo'sh maydon topish"

1. Sana: `Bugun | Ertaga | [7 kunlik tanlov]`
2. Vaqt: `Hozir | 18:00 | 19:00 | 20:00 | 21:00 | 22:00 | Boshqa`
3. Joylashuv: `📍 Lokatsiya yuborish` yoki `Tuman tanlash`
4. Natija: bo'sh maydonlar ro'yxati (masofa, narx, reyting), sahifalab 5 tadan
5. Maydonni tanlash → kartochka → davomiylik (`1 soat | 2 soat | 3 soat`) → xulosa → `✅ Bandlash`
6. Telefon hali berilmagan bo'lsa → shu yerda kontakt so'raladi, keyin oqim davom etadi (holat yo'qolmaydi)

### 5.3 Owner paneli

```
📋 Bugungi jadval          ⏳ Kutilayotgan so'rovlar (3)
➕ Qo'lda bandlov          🚫 Vaqtni bloklash
🏟 Stadionlarim            💰 Narxlar
🕒 Ish vaqti / dam kunlar  👥 Xodimlar
💬 Sharhlar                📊 Statistika
```

### 5.4 Bot texnik qoidalari

- Asosan inline klaviatura ishlatiladi. Iloji boricha xabar **tahrirlanadi** (`editMessageText`), chat yangi xabarlar bilan to'lib ketmaydi.
- `callback_data` ≤ 64 bayt. Shuning uchun qisqa kodlar ishlatiladi (`b:c:<shortId>`); uzun holat sessiyada (Redis) saqlanadi.
- Har bir callback tugmasi **idempotent** bo'lishi kerak (ikki marta bosish = bir marta).
- Eskirgan tugma bosilsa ("bu slot allaqachon band"), tushunarli `answerCallbackQuery` alert ko'rsatiladi va ro'yxat yangilanadi.
- Deep link: `t.me/<bot>?start=v_<venueSlug>` — stadion o'z Instagram'iga qo'yadigan to'g'ridan-to'g'ri havola.
- Inline mode: `@bot stadion nomi` — guruh chatida stadionni ulashish [v2].
- Guruh chatida "kim o'ynaydi" so'rovnomasi [v2].
- Produksiyada webhook, lokal ishlab chiqishda long polling.

---

## 6. Nofunksional talablar

| Soha                    | Talab                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vaqt zonasi**         | Barcha vaqtlar bazada **UTC** da saqlanadi. Venue'da `timezone` (standart `Asia/Tashkent`, UTC+5, yozgi vaqt yo'q) bor. Slot hisoblash venue zonasida bajariladi. "Biznes sanasi" (`businessDate`) alohida saqlanadi (yarim tundan keyingi slotlar uchun, EC-S1)                                                                                                                                      |
| **Pul**                 | Butun son, **so'mda** (`int`, tiyinsiz). Float ishlatilmaydi. `Money` value object                                                                                                                                                                                                                                                                                                                    |
| **Ishonchlilik**        | Double booking'ga texnik kafolat (7.5-bo'lim)                                                                                                                                                                                                                                                                                                                                                         |
| **Unumdorlik**          | Bot javobi p95 < 1 s; qidiruv p95 < 300 ms (10k venue'gacha)                                                                                                                                                                                                                                                                                                                                          |
| **Masshtab**            | API stateless (holat Redis'da), gorizontal kengaytiriladi. Bot va worker'lar alohida process                                                                                                                                                                                                                                                                                                          |
| **Xavfsizlik**          | Telegram webhook secret token; initData HMAC; rate limit (foydalanuvchiga ~30 so'rov/daqiqa); input validatsiya; telefon raqamlar faqat kerakli rollarga ko'rinadi                                                                                                                                                                                                                                    |
| **Shaxsiy ma'lumotlar** | Player telefoni Owner/Staff'ga **so'rov yuborilgan paytdan** ko'rinadi, faqat shu venue'dagi so'rov/bandlov doirasida. Player bandlashdan oldin "Raqamingiz stadion egasiga yuboriladi" degan ogohlantirishni ko'radi (rozilik). Venue telefoni hamma uchun ochiq                                                                                                                                     |
| **Hosting (Q10)**       | **Barcha ma'lumotlar O'zbekiston hududidagi serverda** (O'zR "Shaxsga doir ma'lumotlar to'g'risida"gi qonuni). Natijalari: MongoDB Atlas va boshqa xorijiy managed DB **ishlatilmaydi**. MongoDB replica set (3 node) va Redis mahalliy VPS/cloud'da o'zimiz ko'taramiz, backup ham o'zimizda. Xatolar monitoringi self-hosted bo'ladi (GlitchTip/Sentry self-hosted) yoki SaaS'ga PII'siz yuboriladi |
| **Kuzatuv**             | Strukturali JSON log (pino), `correlationId`; OpenTelemetry trace; xatolar uchun Sentry; health/readiness endpointlar                                                                                                                                                                                                                                                                                 |
| **Audit**               | Bandlov holati bo'yicha har bir o'zgarish: kim, qachon, nimadan nimaga, sabab (`BookingHistory`)                                                                                                                                                                                                                                                                                                      |
| **Lokalizatsiya**       | Barcha matnlar i18n fayllarda; domain'da matn yo'q, faqat xato kodlari                                                                                                                                                                                                                                                                                                                                |
| **Zaxira nusxa**        | MongoDB kunlik backup, 14 kun saqlanadi; tiklash har chorakda sinab ko'riladi                                                                                                                                                                                                                                                                                                                         |

---

## 7. Arxitektura

### 7.1 Yondashuv

- **Modulli monolit + DDD + Hexagonal (Ports & Adapters)**. Mikroservislar MVP uchun ortiqcha murakkablik. Bounded context'lar alohida modul bo'lib, chegaralari qat'iy: keyinchalik ajratish mumkin bo'ladi.
- **CQRS-lite**: yozish — aggregate + repository orqali; o'qish (qidiruv, jadval) — optimallashtirilgan query/read-model orqali.
- **Domain Events** kontekstlar orasida bog'lanish uchun (sinxron in-process + Outbox orqali asinxron).
- Bot va REST API — bir xil **application layer** ustidagi ikki xil **interface adapter**. Bu React web-app'ni keyin "bepul" ulash imkonini beradi.

### 7.2 Bounded Context xaritasi

```
┌────────────┐     ┌────────────────┐     ┌──────────────────┐
│  Identity  │◄────│ Venue Catalog  │◄────│ Schedule&Pricing │
│ (User,Role)│     │ (Venue, Pitch) │     │ (Schedule, Rule) │
└─────┬──────┘     └───────┬────────┘     └────────┬─────────┘
      │                    │                       │
      │            ┌───────▼───────────────────────▼───┐
      └───────────►│        Booking  (CORE)            │
                   │  Booking, Block, SlotLock         │
                   └───────┬───────────────────────────┘
                           │ domain events
          ┌────────────────┼──────────────────┐
          ▼                ▼                  ▼
   ┌────────────┐   ┌──────────────┐   ┌──────────────┐
   │  Reviews   │   │Notifications │   │  Reputation  │
   └────────────┘   └──────────────┘   └──────────────┘
```

| Context            | Turi         | Izoh                                                                   |
| ------------------ | ------------ | ---------------------------------------------------------------------- |
| Booking            | **Core**     | Biznes qiymati shu yerda, eng ko'p test shu yerga                      |
| Schedule & Pricing | Core         | Availability hisoblash                                                 |
| Venue Catalog      | Supporting   |                                                                        |
| Reviews            | Supporting   |                                                                        |
| Identity           | Generic      |                                                                        |
| Notifications      | Generic      |                                                                        |
| Payments           | Generic [v2] | Click/Payme/Uzum adapterlari                                           |
| Subscription       | Supporting   | Tarif, obuna muddati, `FeatureGate`                                    |
| Marketing          | Supporting   | Kampaniyalar (yangi polya, chegirma), MK-qoidalari, opt-out            |
| Search             | Supporting   | `VenueSearchPort`, normallashtirish, orientirlar katalogi, `SlotWatch` |

**Kontekstlar orasidagi qoidalar:**

- Bir kontekst boshqasining ichki entity'siga to'g'ridan-to'g'ri murojaat qilmaydi. Faqat ID orqali (`VenueId`, `UserId`) va ochiq **port/facade** orqali.
- Bir kontekstning Mongo kolleksiyasini boshqa kontekst o'qimaydi/yozmaydi.
- Booking'ga Venue ma'lumoti kerak bo'lsa (nomi, timezone, tasdiqlash rejimi), u `VenueCatalogPort` orqali so'raydi yoki snapshot saqlaydi.

### 7.3 Aggregate'lar va invariantlar

| Aggregate   | Root            | Ichidagilar                                | Asosiy invariantlar                                                          |
| ----------- | --------------- | ------------------------------------------ | ---------------------------------------------------------------------------- |
| User        | `User`          | Phone, roles                               | telegramId noyob; telefon E.164 formatda (+998…)                             |
| Venue       | `Venue`         | Address, Location, Amenities, StaffMembers | Kamida 1 kontakt telefon; faqat `APPROVED` bo'lsa qidiruvda chiqadi          |
| Pitch       | `Pitch`         | Specs                                      | Bitta Venue'ga tegishli; `ARCHIVED` bo'lsa yangi bandlov qabul qilmaydi      |
| Schedule    | `PitchSchedule` | WeeklyHours, Exceptions, SlotSize          | Oraliqlar ustma-ust tushmaydi; davomiylik slot uzunligiga karrali            |
| PricingPlan | `PricingPlan`   | PricingRule[]                              | Ish vaqtidagi har bir daqiqaga narx belgilangan (bo'sh joy yo'q)             |
| Booking     | `Booking`       | TimeRange, PriceSnapshot, History          | State machine; TimeRange slot to'riga mos; boshlanishi kelajakda; ufq ichida |
| Block       | `Block`         | TimeRange, reason                          | Faol bandlov ustiga qo'yilmaydi                                              |
| Review      | `Review`        | Ratings, OwnerReply                        | 1 booking = 1 review; booking `COMPLETED`                                    |

**Value Object'lar:** `Money`, `TimeRange`, `PhoneNumber`, `GeoPoint`, `LocalTime`, `BusinessDate`, `Rating`, `BookingStatus`, `SlotSize`.

### 7.4 Kod tuzilmasi (monorepo)

```
polya_top/
├── apps/
│   ├── api/                  # NestJS: REST API + bot webhook + composition root
│   ├── worker/               # NestJS: BullMQ worker'lar (expire, remind, notify, outbox)
│   └── web/                  # [v2] React + Vite (Telegram Mini App + web)
├── packages/
│   ├── contracts/            # API DTO/sxemalar (Zod) — backend va frontend uchun umumiy
│   └── shared-kernel/        # Result, DomainEvent, Money, TimeRange, Clock...
├── src/modules/ (apps/api ichida)
│   └── booking/
│       ├── domain/           # Toza TS: aggregate, VO, event, domain service, repository INTERFACE
│       │                     #   ❗ NestJS, Mongoose, grammY import qilish TAQIQLANGAN
│       ├── application/      # Use case'lar (command/query handler), port'lar, policy'lar
│       ├── infrastructure/   # Mongoose schema, repository impl, mapper, tashqi adapterlar
│       └── interface/
│           ├── http/         # Controller'lar (REST)
│           └── telegram/     # Bot handler'lar, klaviaturalar, matnlar
├── docs/
│   ├── TZ.md
│   └── adr/                  # Architecture Decision Records
└── docker-compose.yml
```

**Qatlam qoidalari** (CI'da `dependency-cruiser` bilan avtomatik tekshiriladi):
`interface → application → domain`; `infrastructure → application/domain`; `domain` hech narsaga bog'liq emas.

### 7.5 Double booking'ga qarshi kafolat (eng muhim texnik qaror)

**Muammo:** Q1 modelida so'rovlar navbatga turadi, shuning uchun poyga (race) **tasdiqlash** paytiga ko'chadi. Masalan, Owner telefonda 1-so'rovni tasdiqlayotgan paytda Staff 2-so'rovni tasdiqlaydi. Yoki Owner tasdiqlayotganda boshqa Staff qo'lda bandlov kiritadi.

**Yechim — slot-lock kolleksiyasi + noyob indeks (faqat tasdiqlangan bandlovlar uchun):**

```
collection: slot_locks
{ pitchId, slotStart (UTC, 1 soatlik to'r), ownerType: BOOKING|BLOCK, ownerRefId, createdAt }
unique index: { pitchId: 1, slotStart: 1 }
```

- **So'rov yaratish (`PENDING`)** lock olmaydi. U faqat tekshiradi: slot `CONFIRMED`/blok bilan band emasmi, navbat limiti (BK-3e) to'lmaganmi.
- **Tasdiqlash** (shuningdek qo'lda bandlov va blok) **bitta Mongo tranzaksiyasida** bajariladi: bandlov holati `CONFIRMED` bo'ladi, har bir 1 soatlik bo'lak uchun `slot_lock` yoziladi va kesishadigan `PENDING`lar `REJECTED(SLOT_TAKEN)` qilinadi.
- Ikkinchi tasdiqlovchi noyob indeksga urilib `E11000 duplicate key` oladi va tranzaksiya bekor bo'ladi. Unga "Bu vaqt hozirgina X tomonidan Ali'ga berildi" degan xabar ko'rsatiladi.
- Bandlov bekor qilinganda xuddi shu tranzaksiyada lock'lar o'chiriladi.
- Bloklar ham xuddi shu lock'lardan foydalanadi, shuning uchun bandlov va blok ham to'qnashmaydi.
- Kafolat **ma'lumotlar bazasi darajasida**: ilova kodidagi xato ham double booking keltirib chiqara olmaydi.
- Talab: MongoDB **replica set** (tranzaksiyalar uchun), lokalda ham bitta node'li replica set.

**Muqobillar va nega tanlanmadi:** Redis lock — DB bilan atomik emas; "avval tekshir, keyin yoz" — race condition; bitta hujjatda slot massivi — hujjat o'sib ketadi va katta contention bo'ladi.

> **Muhim natija:** vaqt to'ri qat'iy — 1 soat. Shuning uchun 19:00–21:00 va 20:00–21:00 bandlovlari 20:00 dagi lock'da to'qnashadi va bu baza darajasida aniqlanadi.

### 7.6 Asinxron jarayonlar (BullMQ)

| Job                | Trigger                           | Izoh                                                        |
| ------------------ | --------------------------------- | ----------------------------------------------------------- |
| `booking.expire`   | PENDING yaratilganda, delayed job | Ishga tushganda holat qayta tekshiriladi (idempotent)       |
| `booking.complete` | Har 5 daqiqada cron               | `endAt < now` va `CONFIRMED` bo'lganlar → `COMPLETED`       |
| `booking.remind`   | CONFIRMED bo'lganda, delayed      | Bekor qilinsa, job o'chiriladi yoki ishlaganda tekshiriladi |
| `review.invite`    | COMPLETED + 2 soat                |                                                             |
| `outbox.dispatch`  | Doimiy                            | Outbox → event bus / notification queue                     |
| `notify.telegram`  | Event'lardan                      | Rate-limited, retry + backoff                               |

**Qoida:** har bir job **idempotent** va ishlaganda haqiqiy holatni bazadan qayta tekshiradi (job'ga ishonilmaydi, baza — haqiqat manbai).

### 7.7 REST API (React web-app uchun tayyorgarlik)

- `/api/v1/...`, OpenAPI 3.1 hujjati avtomatik generatsiya qilinadi.
- MVP'da REST faqat bot ishlatadigan use case'lar uchun ochiladi (ular bir xil). Web-app keyinroq qo'shilsa, backend o'zgarishi minimal bo'ladi.
- DTO sxemalari `packages/contracts` ichida (Zod) — React tomonida ham shu tiplar ishlatiladi.
- Xato formati: RFC 9457 Problem Details (`type`, `title`, `status`, `code`, `detail`).
- Idempotency: `POST /bookings` uchun `Idempotency-Key` header.
- Pagination: cursor-based.

---

## 8. Texnologiyalar steki

> ✅ Versiyalar 0-bosqichda (2026-11-11) registry'dan tekshirilib qat'iy belgilandi — aniq ro'yxat va asoslangan istisnolar (TypeScript 6, nestjs-zod o'rniga o'z pipe, MongoDB 8.2): [ADR-0003](adr/0003-stack-and-versions.md).

| Soha                     | Tanlov                                                  | Versiya (tavsiya)                                                         | Nega                                                                                               |
| ------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Runtime                  | Node.js                                                 | **Active LTS** (24.x yoki 26.x — 0-bosqichda NestJS mosligi tekshiriladi) | LTS — produksiya uchun                                                                             |
| Til                      | TypeScript                                              | so'nggi stabil, `strict: true`                                            |                                                                                                    |
| Framework                | NestJS                                                  | so'nggi stabil major (11.x+)                                              | Talab qilingan; DI, modullar                                                                       |
| HTTP adapter             | Fastify (`@nestjs/platform-fastify`)                    |                                                                           | Express'dan tezroq                                                                                 |
| CQRS                     | `@nestjs/cqrs`                                          |                                                                           | Command/Query/Event bus                                                                            |
| DB                       | MongoDB                                                 | **8.x** (replica set)                                                     | Talab qilingan; tranzaksiyalar, `2dsphere`                                                         |
| ODM                      | Mongoose                                                | so'nggi stabil major                                                      | Faqat infrastructure qatlamida                                                                     |
| Telegram                 | **grammY**                                              | so'nggi stabil                                                            | TS-first, faol, conversations/menu/ratelimiter plaginlari bor (Telegraf'ga qaraganda zamonaviyroq) |
| Cache / sessiya / navbat | Redis (yoki Valkey)                                     | 7.4+/8.x                                                                  | Bot sessiyasi, rate limit, BullMQ                                                                  |
| Navbat                   | BullMQ (`@nestjs/bullmq`)                               |                                                                           | Delayed job'lar, retry                                                                             |
| Validatsiya              | Zod (+ `nestjs-zod`)                                    | Zod 4                                                                     | Bitta sxema backend va frontend uchun                                                              |
| Vaqt                     | `date-fns` + `@date-fns/tz` (yoki Temporal polyfill)    |                                                                           | Timezone'ga xavfsiz                                                                                |
| Konfiguratsiya           | `@nestjs/config` + Zod env validatsiyasi                |                                                                           | Noto'g'ri env bilan ishga tushmaydi                                                                |
| Log                      | `nestjs-pino`                                           |                                                                           |                                                                                                    |
| Kuzatuv                  | OpenTelemetry + GlitchTip/Sentry (self-hosted, Q10)     |                                                                           | Ma'lumotlar UZ'dan chiqmaydi                                                                       |
| Hosting                  | O'zbekistondagi VPS/cloud, Docker; Mongo RS 3 node      |                                                                           | Q10                                                                                                |
| Test                     | **Vitest** + `@testcontainers/mongodb` + Supertest      |                                                                           | Haqiqiy Mongo replica set bilan integratsion test                                                  |
| Lint/format              | Biome (Q12)                                             |                                                                           |                                                                                                    |
| Paket menejer            | **pnpm** workspaces (+ Turborepo)                       |                                                                           | Monorepo                                                                                           |
| Arxitektura tekshiruvi   | dependency-cruiser                                      |                                                                           | Qatlam qoidalari CI'da                                                                             |
| Konteyner                | Docker + docker compose                                 |                                                                           |                                                                                                    |
| CI                       | GitHub Actions                                          |                                                                           | lint → typecheck → test → build                                                                    |
| Frontend [v2]            | React 19 + Vite + TanStack Query + `@telegram-apps/sdk` |                                                                           | Mini App                                                                                           |

---

## 9. Ma'lumotlar modeli (MongoDB kolleksiyalari)

| Kolleksiya           | Asosiy maydonlar                                                                                                                                                                                                                                                                                                                                                 | Indekslar                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `cities`             | `_id`, `slug`, `name{uz,ru}`, `timezone`, `center{type:Point}`, `isActive`, `order`, `districts[{_id, name{uz,ru}, isActive}]`                                                                                                                                                                                                                                   | `slug` unique; `isActive+order`                                                                                           |
| `users`              | `_id`, `telegramId`, `phone`, `firstName`, `lang`, `cityId`, `marketingOptOut`, `marketingSentThisWeek[]`, `roles[]`, `isBotBlocked`, `reputation{completed,noShow,lateCancel}`, `status`                                                                                                                                                                        | `telegramId` unique; `phone` unique sparse                                                                                |
| `venues`             | `_id`, `slug`, `ownerId`, `staff[{userId, permissions}]`, `name`, `landmarkText`, `searchText`, `completeness`, `address?`, `cityId`, `districtId?`, `location{type:Point,coordinates}`, `phones[]`, `amenities[]`, `photos[]`, `timezone`, `settings{confirmationMode, pendingTtlMin, horizonDays, minLeadMin, freeCancelHours}`, `rating{avg,count}`, `status` | `location` 2dsphere; `slug` unique; `ownerId`; `status+cityId+districtId`; text(`name`)                                   |
| `pitches`            | `_id`, `venueId`, `name`, `format`, `surface`, `indoor`, `lighting`, `size`, `slotSizeMin`, `photos[]`, `status`, `rating`                                                                                                                                                                                                                                       | `venueId`                                                                                                                 |
| `pitch_schedules`    | `pitchId`, `weekly[{dow, open, close}]`, `exceptions[{date, closed, open?, close?, reason}]`                                                                                                                                                                                                                                                                     | `pitchId` unique                                                                                                          |
| `pricing_plans`      | `pitchId`, `rules[{kind, dows?, date?, from, to, pricePerHour}]`                                                                                                                                                                                                                                                                                                 | `pitchId` unique                                                                                                          |
| `bookings`           | `_id`, `code` (qisqa, odam o'qiy oladigan), `pitchId`, `venueId`, `playerId?`, `guest{name,phone}?`, `source(BOT/MANUAL/WEB)`, `startAt`, `endAt`, `businessDate`, `price{amount,currency}`, `status`, `expiresAt?`, `rejectReason?(OWNER/SLOT_TAKEN)`, `cancelReason?`, `confirmedBy?`, `queueOrder` (so'rov kelgan vaqti), `history[]`, `seriesId?`, `version` | `pitchId+status+startAt` (navbatni topish); `playerId+startAt`; `venueId+businessDate`; `status+expiresAt`; `code` unique |
| `slot_locks`         | `pitchId`, `slotStart` (1 soatlik to'r), `ownerType(BOOKING/BLOCK)`, `ownerRefId`. **Faqat `CONFIRMED` bandlovlar va bloklar**                                                                                                                                                                                                                                   | **`pitchId+slotStart` unique**                                                                                            |
| `blocks`             | `_id`, `pitchId`, `startAt`, `endAt`, `reason`, `createdBy`                                                                                                                                                                                                                                                                                                      | `pitchId+startAt`                                                                                                         |
| `reviews`            | `_id`, `bookingId`, `venueId`, `pitchId`, `authorId`, `ratings{}`, `text`, `ownerReply?`, `reportsCount`, `status`                                                                                                                                                                                                                                               | `bookingId` unique; `venueId+createdAt`                                                                                   |
| `condition_reports`  | `pitchId`, `authorId`, `text`, `tags[]`, `expiresAt`                                                                                                                                                                                                                                                                                                             | `expiresAt` TTL                                                                                                           |
| `landmarks`          | `cityId`, `name{uz,ru}`, `synonyms[]`, `location{type:Point}`, `isActive`                                                                                                                                                                                                                                                                                        | `location` 2dsphere; `cityId`                                                                                             |
| `search_synonyms`    | `cityId?`, `terms[]` (bir guruhdagi sinonimlar)                                                                                                                                                                                                                                                                                                                  | `terms`                                                                                                                   |
| `slot_watches`       | `pitchId`, `slotStart`, `userId`, `createdAt`, `notifiedAt?`, `expiresAt`                                                                                                                                                                                                                                                                                        | `pitchId+slotStart+createdAt`; `userId`; `expiresAt` TTL                                                                  |
| `subscriptions`      | `venueId`, `plan(FREE/PREMIUM)`, `startsAt`, `endsAt`, `source(FOUNDER_TRIAL/MANUAL_PAYMENT/…)`, `activatedBy`, `history[]`                                                                                                                                                                                                                                      | `venueId` unique; `endsAt`                                                                                                |
| `promotions`         | `venueId`, `pitchId`, `slots[]`, `discountPct`, `status`, `campaignId`                                                                                                                                                                                                                                                                                           | `venueId+createdAt`                                                                                                       |
| `campaigns`          | `type(NEW_VENUE/PROMO/CUSTOMERS)`, `cityId`, `venueId`, `stats{sent,delivered,clicked,blocked}`, `status`                                                                                                                                                                                                                                                        | `venueId+type` (NEW_VENUE uchun unique)                                                                                   |
| `outbox`             | `_id`, `type`, `payload`, `occurredAt`, `processedAt?`, `attempts`                                                                                                                                                                                                                                                                                               | `processedAt+occurredAt`                                                                                                  |
| `owner_applications` | ariza ma'lumotlari, `status`                                                                                                                                                                                                                                                                                                                                     |                                                                                                                           |

- Optimistic concurrency: aggregate'larda `version` maydoni (Booking holatini parallel o'zgartirishdan himoya, EC-B4).
- ID'lar: Mongo `ObjectId`; tashqariga ko'rsatiladigan bandlov kodi — qisqa (`PT-7K3Q9`).

---

## 10. Bosqichlar (Roadmap) va qabul qilish mezonlari

Har bosqich oxirida: kod + testlar → siz tekshirasiz → tasdiqlaysiz → keyingisiga o'tamiz.

| #           | Bosqich                  | Natija                                                                                                                                                                                                            | Qabul qilish mezoni (Definition of Done)                                                                                                                                                                                                  |
| ----------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0**       | Fundament                | Monorepo, Docker (Mongo RS + Redis), config, log, health, CI, dependency-cruiser, shared-kernel, ADR'lar                                                                                                          | `docker compose up` → `/health` 200; CI yashil; domain qatlami Nest'ni import qilsa CI yiqiladi                                                                                                                                           |
| **1**       | Identity + Bot skeleti   | `/start`, til, kontakt ulashish, asosiy menyu, sessiya                                                                                                                                                            | ID-1…ID-6 testlari; birovning kontakti rad etiladi                                                                                                                                                                                        |
| **2**       | Venue Catalog + Search   | Shaharlar/hududlar (admin), sodda onboarding (VC-2), profil to'liqligi, orientirlar katalogi, normallashtirilgan matnli qidiruv, Owner arizasi, admin tasdiqlashi, Venue/Pitch CRUD (bot), kartochka, geo qidiruv | Yaqin atrofni qidirish to'g'ri tartibda; `PENDING_REVIEW` qidiruvda chiqmaydi                                                                                                                                                             |
| **3**       | Schedule & Pricing       | Haftalik jadval, istisnolar, narx qoidalari, **Availability hisoblash**                                                                                                                                           | Unit testlar: yarim tundan o'tadigan jadval, bayram, narx ustuvorligi, slot to'ri                                                                                                                                                         |
| **4**       | **Booking (core)**       | Yaratish, state machine, tasdiqlash/rad etish, expire, bekor qilish, qo'lda bandlov, bloklash                                                                                                                     | **Konkurent test: bitta slotdagi turli so'rovlarni 50 ta parallel tasdiqlash (va qo'lda bandlov/blok aralash) → aniq 1 tasi `CONFIRMED`, qolganlari `SLOT_TAKEN`.** Navbat va kontakt almashinuvi testlangan. Barcha o'tishlar testlangan |
| **5**       | Notifications + Jobs     | Outbox, BullMQ, eslatmalar, auto-complete, rate limit                                                                                                                                                             | Bot bloklangan foydalanuvchida yiqilmaydi; job'lar idempotent                                                                                                                                                                             |
| **6**       | Reviews + Reputation     | Sharh, javob, shikoyat, reyting, no-show                                                                                                                                                                          | Faqat COMPLETED'dan keyin; reyting to'g'ri qayta hisoblanadi                                                                                                                                                                              |
| **6a**      | Marketing + Subscription | "Yangi polya" e'loni, MK-qoidalari, `SlotWatch`, `FeatureGate`, asoschi uchun 3 oylik trial, chegirma e'loni, "Tavsiya etiladi"                                                                                   | Haftalik limit va 10:00–21:00 oynasi testlangan; FREE stadion premium funksiyani ishlata olmaydi                                                                                                                                          |
| **7**       | Admin + Hardening        | Moderatsiya, statistika, rate limit, Sentry, backup, load test                                                                                                                                                    | Bot p95 < 1 s; xavfsizlik checklist'i                                                                                                                                                                                                     |
| **8**       | REST API + OpenAPI       | Web uchun endpointlar, initData auth, contracts paketi                                                                                                                                                            | OpenAPI hujjati; e2e testlar                                                                                                                                                                                                              |
| **9** [v2]  | React Mini App           | Xarita, vizual jadval (kalendar)                                                                                                                                                                                  |                                                                                                                                                                                                                                           |
| **10** [v2] | To'lovlar                | Depozit, qaytarish                                                                                                                                                                                                |                                                                                                                                                                                                                                           |

---

## 11. Qarorlar jurnali (barcha savollar yopilgan)

| #   | Savol                                                           | Mening tavsiyam                                                                                                          |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Q1  | Bandlovni tasdiqlash                                            | ✅ **QAROR:** har doim qo'lda (Owner/Staff). Kontaktlar ikki tomonga almashinadi, so'rovlar navbatga turadi (BK-2…BK-3f) |
| Q2  | Vaqt to'ri                                                      | ✅ **QAROR:** A variant — faqat butun soatlar, 1/2/3 soat (SP-3)                                                         |
| Q2a | Bitta slotdagi navbat limiti                                    | ✅ **QAROR:** 3 ta so'rov                                                                                                |
| Q2b | Bir Player bir vaqtga ikki xil stadionga so'rov yubora oladimi? | ✅ **QAROR:** yo'q (EC-B6)                                                                                               |
| Q2c | So'rov muddati                                                  | ✅ **QAROR:** 60 daqiqa, 10 daqiqa oldin eslatma (BK-3f)                                                                 |
| Q3  | MVP'da oldindan to'lov kerakmi?                                 | ✅ **QAROR (standart):** yo'q, to'lov joyida qilinadi. Onlayn to'lov — v2                                                |
| Q4  | Monetizatsiya modeli?                                           | ✅ **QAROR (standart):** MVP bepul; keyin obuna yoki komissiya. `Subscription` uchun joy qoldiriladi                     |
| Q5  | Kim stadion qo'shadi?                                           | ✅ **QAROR (Q6 bilan birga):** faqat Owner o'zi. Owner ham, stadion ham admin tasdig'idan o'tadi                         |
| Q6  | Owner'i yo'q stadionlar katalogda ko'rinsinmi?                  | ✅ **QAROR:** yo'q. Avval Owner kiradi, keyin stadion qo'shadi (VC-1)                                                    |
| Q7  | `ConditionReport` (tezkor holat) MVP'gami?                      | ✅ **QAROR (standart):** ha, sodda variantda                                                                             |
| Q8  | Til                                                             | ✅ **QAROR (standart):** uz-lotin + ru                                                                                   |
| Q9  | Shahar                                                          | ✅ **QAROR:** shaharlarni Admin qo'shadi, foydalanuvchi faqat ro'yxatdan tanlaydi. MVP'da faqat **Olmaliq** (4.2.1)      |
| Q10 | Hosting                                                         | ✅ **QAROR:** O'zbekistonda. Natijalari 6-bo'limda (self-hosted Mongo RS, Atlas yo'q)                                    |
| Q10a | Demo / staging hosting (2026-11-14)                            | ✅ **QAROR:** Render free (web + Key Value) + MongoDB Atlas M0, `render.yaml`. Keep-alive o'z-o'zini ping. Produksiya — Q10 |
| Q11 | No-show sanksiyasi                                              | ✅ **QAROR (standart):** 4.8-bo'limdagi yumshoq variant                                                                  |
| Q12 | Lint                                                            | ✅ **QAROR (standart):** Biome; NestJS bilan muammo chiqsa ESLint                                                        |
| Q13 | Stadion qo'shishda nimalar so'raladi                            | ✅ **QAROR:** nom, orientir, ish vaqti, narx. Qolgani keyin tahrirlanadi, profil to'liqligi 30% dan boshlanadi (VC-2)    |
| Q14 | "Yangi polya ochildi" e'loni                                    | ✅ **QAROR:** tekin, har bir stadion uchun bir marta (MK-5)                                                              |
| Q15 | Premium funksiyalar ro'yxati                                    | ✅ **QAROR:** 4.9-bo'limdagi jadval                                                                                      |
| Q16 | Ishga tushirishda premium                                       | ✅ **QAROR:** barcha Owner'larga 3 oy tekin ("Asoschi hamkor")                                                           |
| Q17 | Orientirlar katalogi MVP'gami                                   | ✅ **QAROR (standart):** ha (VC-4b)                                                                                      |

---

## 12. Edge case'lar

### 12.1 Jadval va vaqt (S)

| ID     | Holat                                                                                       | Kutilgan xatti-harakat                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EC-S1  | Ish vaqti 08:00–02:00 (yarim tundan o'tadi). 00:00–02:00 slotlari qaysi kunga tegishli?     | Biznes kuniga (oldingi kunga) tegishli. "Juma kechasi 01:00" = juma `businessDate`, shanba kalendar sanasi. UI'da aniq ko'rsatiladi: "Juma, 01:00 (shanbaga o'tar kechasi)" |
| EC-S2  | Haftalik jadval o'zgardi, lekin yangi jadvaldan tashqarida qolgan bandlovlar bor            | O'zgarish saqlanadi, mavjud bandlovlar **tegilmaydi**; Owner'ga "jadvaldan tashqarida qolgan N ta bandlov bor" ogohlantirishi va ularni bekor qilish taklifi ko'rsatiladi   |
| EC-S3  | Bandlovlar bor kunga istisno ("yopiq") qo'shildi                                            | Xuddi EC-S2: avtomatik bekor qilinmaydi, Owner'dan aniq tasdiq so'raladi, keyin Player'larga sabab bilan xabar yuboriladi                                                   |
| EC-S4  | Narx o'zgardi, eski bandlovlar bor                                                          | Eski bandlov narxi o'zgarmaydi (snapshot, SP-5)                                                                                                                             |
| EC-S5  | Bandlov ikki narx zonasini kesib o'tadi (17:30–19:00, 18:00 dan narx oshadi)                | Narx har bir slot bo'yicha alohida hisoblanib qo'shiladi; xulosada taqsimot ko'rsatiladi                                                                                    |
| EC-S6  | Ish vaqti butun soatda tugamaydi (masalan, 08:30–23:30)                                     | Validatsiya xatosi: ish vaqti chegaralari butun soatda bo'lishi shart (1 soatlik to'r)                                                                                      |
| EC-S12 | Bandlov ish vaqti oxiridan chiqib ketadi (ish vaqti 23:00 gacha, 22:00 dan 2 soat tanlandi) | Faqat ish vaqti ichiga sig'adigan davomiyliklar tugmalarda ko'rsatiladi                                                                                                     |

### 12.1a Shaharlar (C)

| ID    | Holat                                                                             | Kutilgan xatti-harakat                                                                                                                                          |
| ----- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EC-C1 | Faqat bitta faol shahar bor                                                       | Foydalanuvchidan shahar so'ralmaydi, u avtomatik tanlanadi                                                                                                      |
| EC-C2 | Admin shaharni nofaol qildi, lekin unda stadionlar va faol bandlovlar bor         | Mavjud bandlovlar o'z kuchida qoladi. Yangi stadion qo'shish va qidiruv to'xtatiladi. Bunday holatda nofaol qilishdan oldin Admin'ga ogohlantirish ko'rsatiladi |
| EC-C3 | Foydalanuvchi tanlagan shaharda hali stadion yo'q                                 | "Bu shaharda hozircha stadion yo'q" xabari + boshqa shaharni tanlash taklifi                                                                                    |
| EC-C4 | Stadion lokatsiyasi tanlangan shahar chegarasidan ancha uzoqda (masalan, > 30 km) | Admin tasdiqlashda ogohlantirish ko'rsatiladi (xato kiritilgan bo'lishi mumkin)                                                                                 |
| EC-C5 | Admin hududni o'chirdi, unga bog'langan stadionlar bor                            | Hudud o'chirilmaydi, faqat nofaol qilinadi; stadionlar bog'liq holda qoladi                                                                                     |
| EC-C6 | Bir xil nomli shahar qayta qo'shilmoqchi                                          | `slug` noyob, takror qo'shib bo'lmaydi                                                                                                                          |

### 12.1b Onboarding va qidiruv (O)

| ID    | Holat                                                                             | Kutilgan xatti-harakat                                                                                                                                            |
| ----- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EC-O1 | Owner onboarding o'rtasida chiqib ketdi (masalan, narxni kiritmadi)               | Kiritilganlar `DRAFT` qoralama sifatida saqlanadi. Owner panelida "Davom ettirish" tugmasi chiqadi. Qoralama admin'ga yuborilmaydi va 30 kundan keyin o'chiriladi |
| EC-O2 | Narx sifatida noto'g'ri qiymat yozildi (`150`, `150k`, `150 000 so'm`, `1.5 mln`) | Normallashtiriladi (`150k` → 150 000). 1 000 dan kichik yoki 5 000 000 dan katta qiymat bo'lsa, qayta so'raladi: "150 000 so'm demoqchimisiz?"                    |
| EC-O3 | Ish vaqti "Boshqa" bilan kiritildi, oxiri boshidan oldin (`18:00–02:00`)          | Yarim tundan o'tadigan jadval sifatida qabul qilinadi (EC-S1) va tasdiqlash uchun aniq ko'rsatiladi: "18:00 dan ertasi kuni 02:00 gacha"                          |
| EC-O4 | Orientir juda qisqa yoki ma'nosiz (`.`, `bor`)                                    | Kamida 5 ta belgi bo'lishi shart. Admin tasdiqlashda ko'rib chiqadi                                                                                               |
| EC-O5 | Admin tasdiqlagandan keyin Owner nom yoki orientirni o'zgartirdi                  | Qayta tasdiqlash talab qilinmaydi, lekin o'zgarish Admin'ga xabar sifatida boradi (suiiste'molga qarshi). `searchText` qayta hisoblanadi                          |
| EC-O6 | Qidiruv matni hech narsaga mos kelmadi                                            | "Topilmadi" + eng yaqin orientirlar va "Hozir bo'sh" tugmasi taklif qilinadi. Topilmagan so'rovlar Admin uchun yig'iladi (sinonimlar lug'atini to'ldirish uchun)  |
| EC-O7 | Bir nechta orientir bir xil nomga ega ("Bozor": Markaziy va Dehqon bozori)        | Tanlash uchun ikkalasi ham tugma bo'lib ko'rsatiladi                                                                                                              |
| EC-O8 | Stadion lokatsiyasi yo'q, foydalanuvchi orientir bo'yicha geo qidiryapti          | Bunday stadion faqat matnli moslik bo'yicha chiqadi (VC-2d)                                                                                                       |

### 12.1c Marketing, SlotWatch va Premium (M)

| ID     | Holat                                                                                   | Kutilgan xatti-harakat                                                                                                                                                                                                                |
| ------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EC-M1  | "Yangi polya" e'loni yuborilayotganda Admin stadionni bloklab qo'ydi                    | Kampaniya to'xtatiladi, yuborilmagan xabarlar bekor qilinadi                                                                                                                                                                          |
| EC-M2  | Stadion arxivlandi, keyin qayta tiklandi                                                | "Yangi polya" e'loni qayta yuborilmaydi (`campaigns`da `venueId+NEW_VENUE` noyob)                                                                                                                                                     |
| EC-M3  | Bir kunda shaharda 5 ta yangi polya ochildi                                             | Haftalik limit (MK-2) tufayli foydalanuvchi ko'pi bilan 2 tasini oladi. Bir vaqtda kelganlari bitta umumiy xabarga birlashtiriladi: "Shahringizda 3 ta yangi polya ochildi"                                                           |
| EC-M4  | Premium muddati chegirma e'loni faol turgan paytda tugadi                               | E'lon qilingan chegirmalar o'z kuchida qoladi, yangisini yaratib bo'lmaydi                                                                                                                                                            |
| EC-M5  | Premium tugadi, Owner'da 3 ta Staff bor (FREE limiti — 1 ta)                            | Hech kim o'chirilmaydi, lekin yangi Staff qo'shib bo'lmaydi; Owner'ga "Faqat 1 ta xodim faol qoladi, qaysi biri?" deb tanlash taklif qilinadi va 7 kun muhlat beriladi. Rasmlar ham o'chirilmaydi, faqat birinchi 5 tasi ko'rsatiladi |
| EC-M6  | `SlotWatch`: bo'shagan vaqtga obunachi xabar olib ulgurmasidan uni boshqa odam bandladi | Bu normal holat, birinchi kelgan so'rov oladi. Obunachiga "Afsuski, vaqt yana band bo'ldi" xabari boradi                                                                                                                              |
| EC-M7  | `SlotWatch`: obunachi o'zi shu vaqtga boshqa joyda bandlov qilgan                       | Xabar yuborilmaydi, obuna avtomatik o'chiriladi (EC-B6 bilan mos)                                                                                                                                                                     |
| EC-M8  | Owner o'z stadioni uchun chegirmani 90% qildi                                           | Domain validatsiyasi 10–50% oralig'idan tashqariga chiqishga ruxsat bermaydi                                                                                                                                                          |
| EC-S7  | Server vaqti / foydalanuvchi soati noto'g'ri                                            | Faqat server UTC vaqtiga ishoniladi; vaqt ichki `Clock` porti orqali olinadi (testda boshqariladi)                                                                                                                                    |
| EC-S8  | Hozir 19:40. 19:00–20:00 slotini bandlash mumkinmi?                                     | Yo'q, boshlangan slot bandlanmaydi; minimal lead time (SP-7) ham tekshiriladi                                                                                                                                                         |
| EC-S9  | Bandlash ufqi chegarasi (14-kun 23:00)                                                  | Ufq venue zonasidagi `businessDate` bo'yicha hisoblanadi, soat bo'yicha emas                                                                                                                                                          |
| EC-S10 | Jadval umuman kiritilmagan maydon                                                       | Qidiruvda chiqmaydi; Owner'ga "jadvalni to'ldiring" eslatmasi                                                                                                                                                                         |
| EC-S11 | Narx qoidalari ish vaqtini to'liq qoplamaydi                                            | Saqlashda validatsiya xatosi: narxsiz qolgan oraliq ko'rsatiladi                                                                                                                                                                      |

### 12.2 Bandlov (B)

| ID     | Holat                                                                           | Kutilgan xatti-harakat                                                                                                                                                                                                                                                     |
| ------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EC-B1  | Ikki Player bir vaqtda bitta bo'sh slotga so'rov yubordi                        | Ikkalasi ham `PENDING` bo'ladi: birinchisi navbatda 1-, ikkinchisi 2-o'rinda (`queueOrder` server vaqti bo'yicha). Owner'ga ikkalasi birga ko'rsatiladi (BK-3b)                                                                                                            |
| EC-B1a | Owner va Staff bir vaqtda navbatdagi **turli** so'rovlarni tasdiqladi           | Slot-lock: aniq bittasi `CONFIRMED`; ikkinchisi "Bu vaqt hozirgina X tomonidan Ali'ga berildi" degan xabarni oladi (7.5)                                                                                                                                                   |
| EC-B1b | So'rovlar qisman kesishadi: A 19:00–21:00, B 20:00–21:00. Owner B ni tasdiqladi | A ham kesishgani uchun `SLOT_TAKEN` bo'ladi. Tasdiqlashdan oldin Owner'ga "Bu A so'rovini ham rad etadi" deb ko'rsatiladi                                                                                                                                                  |
| EC-B1c | Navbatdagi 1-o'yinchi telefonni ko'tarmayapti                                   | Owner 2-so'rovni tasdiqlaydi va 1-si avtomatik `SLOT_TAKEN` bo'ladi. Tartib Owner uchun faqat tavsiya, majburiy emas                                                                                                                                                       |
| EC-B1d | Player so'rov yuborayotgan paytda slot tasdiqlandi (band bo'ldi)                | So'rov yaratilmaydi: "Bu vaqt hozirgina band bo'ldi" + muqobil vaqtlar                                                                                                                                                                                                     |
| EC-B1e | Navbat to'lgan (3 ta so'rov)                                                    | Yangi so'rov qabul qilinmaydi (BK-3e)                                                                                                                                                                                                                                      |
| EC-B1f | Player navbatdagi o'z so'rovini bekor qildi                                     | U navbatdan chiqadi. Owner/Staff xabaridagi ro'yxat yangilanadi                                                                                                                                                                                                            |
| EC-B2  | Player "Bandlash"ni ikki marta bosdi (sekin internet)                           | Idempotency: bitta so'rov qoladi, ikkinchi bosishda o'sha so'rov ko'rsatiladi. Bitta Player bitta vaqtga faqat 1 ta faol so'rov bera oladi                                                                                                                                 |
| EC-B3  | Owner tasdiqlash tugmasini bosgan millisekundda timeout job ishladi             | Optimistic locking (`version`): bittasi yutadi; Owner'ga haqiqiy holat ko'rsatiladi ("so'rov muddati o'tib bo'lgan")                                                                                                                                                       |
| EC-B4  | Owner va Staff bitta so'rovni bir vaqtda biri tasdiqlaydi, biri rad etadi       | Optimistic locking; ikkinchisi "allaqachon tasdiqlangan (X tomonidan)" xabarini oladi                                                                                                                                                                                      |
| EC-B5  | Player PENDING'ni bekor qilgan paytda Owner tasdiqladi                          | Xuddi shu: birinchi yozilgan yutadi, ikkinchi tomonga holat bildiriladi                                                                                                                                                                                                    |
| EC-B6  | Player bitta vaqtga ikki xil stadionga so'rov yubormoqchi (zaxira uchun)        | **Ruxsat berilmaydi** (Q2b): bitta Player uchun vaqti ustma-ust tushadigan faol (`PENDING`+`CONFIRMED`) so'rovlar taqiqlanadi. Aks holda Player bir nechta Owner'ni bezovta qiladi va navbatlarni to'ldirib yuboradi. Qo'lda (MANUAL) bandlovlarga bu cheklov qo'llanmaydi |
| EC-B7  | Owner tasdiqlashni kechiktirdi va o'yin vaqti PENDING holatida keldi            | `expiresAt = min(createdAt + TTL, startAt)` — PENDING hech qachon o'yin boshlanishidan o'tib ketmaydi                                                                                                                                                                      |
| EC-B8  | O'yinga 20 daqiqa qolganda so'rov                                               | Lead time ruxsat bersa, so'rov yaratiladi va TTL qisqaradi (EC-B7). Player'ga "Egasi bilan hoziroq bog'laning" deb ko'rsatiladi va raqam ajratib beriladi                                                                                                                  |
| EC-B8a | Telefonda kelishildi, lekin Owner botda tasdiqlashni unutdi                     | Muddat tugashidan 10 daqiqa oldin eslatma boradi (BK-3f). Muddat tugasa ham Owner shu vaqtga qo'lda bandlov kirita oladi                                                                                                                                                   |
| EC-B8b | Owner'ga so'rov xabari yetib bormadi (bot bloklangan)                           | Player'da Owner raqami baribir bor. So'rov yaratilayotganda Owner va Staff'lardan hech biriga yetkazilmasa, Player'ga "Iltimos, egasiga o'zingiz qo'ng'iroq qiling" deb aytiladi va admin ogohlantiriladi                                                                  |
| EC-B9  | Pitch `MAINTENANCE`ga o'tkazildi, kelajakda bandlovlar bor                      | O'tkazishdan oldin ro'yxat ko'rsatiladi; Owner bekor qilish yoki boshqa maydonga ko'chirishni tanlaydi [ko'chirish — v2]                                                                                                                                                   |
| EC-B10 | Venue bloklandi (admin) yoki Owner akkaunti o'chirildi                          | Kelajakdagi bandlovlar Player'larga xabar bilan bekor qilinadi (admin tasdig'i bilan)                                                                                                                                                                                      |
| EC-B11 | Player akkaunti bloklandi, faol bandlovlari bor                                 | Bandlovlar avtomatik bekor qilinadi, Owner'ga xabar yuboriladi                                                                                                                                                                                                             |
| EC-B12 | Player telefon raqamini almashtirdi                                             | Yangi kontakt ulashiladi; eski bandlovlar `playerId`ga bog'langan, shuning uchun yo'qolmaydi                                                                                                                                                                               |
| EC-B13 | Bloklanadigan vaqtda mavjud bandlov bor                                         | Blok yaratilmaydi (lock to'qnashuvi), to'qnashgan bandlov ko'rsatiladi. Faqat `PENDING` so'rovlar bo'lsa, ular ogohlantirish bilan rad etiladi (BK-8)                                                                                                                      |
| EC-B14 | Qo'lda bandlov qilingan mijoz keyin botga kiradi                                | v2: telefon raqam bo'yicha `guest.phone` → `playerId` bog'lash taklifi                                                                                                                                                                                                     |
| EC-B15 | Owner o'z stadionini Player sifatida bandlayapti                                | Ruxsat beriladi, lekin `source=MANUAL` taklif qilinadi; sharh yoza olmaydi (o'z stadioniga)                                                                                                                                                                                |
| EC-B16 | Ko'p soatlik bandlov (masalan, turnir uchun 6 soat)                             | Maksimal davomiylik venue sozlamasida (standart 4 soat); undan ko'pi faqat qo'lda bandlov orqali                                                                                                                                                                           |
| EC-B17 | Bandlov o'rtasida (bitta tranzaksiyada) Mongo uzilishi                          | Tranzaksiya bekor bo'ladi, lock'lar qolmaydi; transient xatolarda retry (`withTransaction`)                                                                                                                                                                                |
| EC-B18 | Bir xil nomli stadionlar / dublikat stadion qo'shish                            | Admin tasdiqlashda yaqin lokatsiya (≤100 m) + o'xshash nom bo'yicha dublikat ogohlantirishi                                                                                                                                                                                |

### 12.3 Telegram (T)

| ID     | Holat                                                           | Kutilgan xatti-harakat                                                                               |
| ------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| EC-T1  | Foydalanuvchi botni bloklagan (403)                             | `isBotBlocked=true`, xabarnoma to'xtaydi, job yiqilmaydi va cheksiz retry qilmaydi                   |
| EC-T2  | 429 Too Many Requests                                           | `retry_after` bo'yicha kutiladi; navbat global va per-chat limitlar bilan                            |
| EC-T3  | Eski xabardagi tugma bosildi (sessiya o'chgan)                  | Sessiyasiz ishlaydigan qilib: callback'da kerakli ID bor; bo'lmasa "menyu yangilandi" + asosiy menyu |
| EC-T4  | 48 soatdan eski xabarni tahrirlab bo'lmaydi / xabar o'chirilgan | Xato ushlanadi, o'rniga yangi xabar yuboriladi                                                       |
| EC-T5  | Webhook bitta update'ni qayta yubordi                           | `update_id` bo'yicha deduplikatsiya (Redis, qisqa TTL)                                               |
| EC-T6  | Foydalanuvchida username yo'q, ismi emoji/bo'sh                 | Ko'rsatishda fallback: "Foydalanuvchi #1234"                                                         |
| EC-T7  | Foydalanuvchi lokatsiya yubormaydi (desktop)                    | Tuman tanlash orqali muqobil yo'l doim bor                                                           |
| EC-T8  | Bot guruhga qo'shildi                                           | MVP'da faqat private chat'da ishlaydi; guruhda qisqa yo'riqnoma ko'rsatadi [v2: guruh funksiyalari]  |
| EC-T9  | Foydalanuvchi oqim o'rtasida boshqa buyruq bosdi                | Joriy "conversation" toza yakunlanadi; yarim qolgan bandlov yaratilmaydi                             |
| EC-T10 | Owner'ning Telegram akkaunti o'chirilgan/yo'qolgan              | Admin orqali Venue egaligini boshqa akkauntga o'tkazish jarayoni                                     |

### 12.4 Sharhlar (R)

| ID    | Holat                                                     | Kutilgan xatti-harakat                                                                            |
| ----- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| EC-R1 | Owner o'z stadioniga sharh yozmoqchi                      | Taqiqlanadi (RV-1 + egalik tekshiruvi)                                                            |
| EC-R2 | Raqobatchi soxta sharh yozmoqchi                          | Faqat COMPLETED bandlovdan keyin mumkin; bandlovni Owner tasdiqlagani uchun soxtalashtirish qiyin |
| EC-R3 | Owner NO_SHOW deb belgilagan bandlov uchun sharh          | Ruxsat berilmaydi. Player NO_SHOW'ga e'tiroz bildira oladi → moderator [v2]                       |
| EC-R4 | Owner noqonuniy NO_SHOW qo'yib, yomon sharhdan qochmoqchi | NO_SHOW belgisi 24 soat ichida; Owner'ning NO_SHOW nisbati admin statistikasida kuzatiladi        |
| EC-R5 | Sharhda telefon raqam, havola, haqorat                    | Avtomatik filtr (regex + so'zlar ro'yxati) → moderatsiyaga                                        |
| EC-R6 | Sharh o'chirildi                                          | Reyting qayta hisoblanadi                                                                         |

### 12.5 Ma'lumot va xavfsizlik (D)

| ID    | Holat                                                                           | Kutilgan xatti-harakat                                                                                    |
| ----- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| EC-D1 | Staff Owner'dan boshqa venue'ni boshqarmoqchi (callback data'ni soxtalashtirib) | Har bir amalda resurs egaligi serverda tekshiriladi; callback ichidagi ID'ga ishonilmaydi                 |
| EC-D2 | Foydalanuvchi o'z ma'lumotlarini o'chirishni so'raydi                           | Akkaunt anonimlashtiriladi (ism/telefon o'chiriladi), bandlov tarixi statistika uchun anonim holda qoladi |
| EC-D3 | Owner Staff'ni olib tashladi                                                    | Staff'ning ruxsati darhol bekor bo'ladi (sessiya/cache invalidatsiyasi)                                   |
| EC-D4 | Juda ko'p so'rov (bot flood)                                                    | Per-user rate limit; anomaliya bo'lsa vaqtincha bloklash                                                  |

---

## 13. Test strategiyasi

| Daraja        | Nimani                                                               | Vosita                                    | Maqsad                  |
| ------------- | -------------------------------------------------------------------- | ----------------------------------------- | ----------------------- |
| Unit (domain) | Aggregate'lar, VO'lar, state machine, availability va narx hisoblash | Vitest, I/O yo'q, `FakeClock`             | Domain coverage ≥ 90%   |
| Integration   | Repository'lar, tranzaksiyalar, indekslar, outbox                    | Vitest + Testcontainers (Mongo RS, Redis) | Har bir repository      |
| Concurrency   | Double booking (parallel tasdiqlash), parallel holat o'zgarishlari   | Parallel `Promise.all` testlari           | EC-B1a, B1b, B3, B4, B5 |
| E2E (API)     | Use case'lar HTTP orqali                                             | Supertest                                 | Asosiy oqimlar          |
| Bot           | Handler'lar, mock Telegram API bilan                                 | grammY test transformer'i                 | Asosiy oqimlar + EC-T*  |
| Load          | Qidiruv va bandlash                                                  | k6                                        | 7-bosqich               |

- Har bir edge case (EC-*) kamida bitta avtomatik testga bog'lanadi: test nomida ID bo'ladi (`it('EC-B1: ...')`).
- Ishlab chiqish va test uchun seed skripti: Olmaliq shahri (hududlari bilan), 20 venue, 40 pitch, real jadvallar.

---

## 14. MVP'dan tashqarida (hozir QILINMAYDI)

- Onlayn to'lov va pulni qaytarish
- React web-app / Mini App (faqat API tayyorgarligi qilinadi)
- Takroriy bandlovlar
- Jamoa yig'ish / "o'yinchi qidiryapmiz" funksiyasi
- Turnirlar
- Push/SMS xabarnomalar (faqat Telegram)
- Owner uchun moliyaviy hisobotlar (premium statistikadan tashqari)
- Avtomatik obuna to'lovi (MVP'da Admin qo'lda yoqadi)
- Ko'p valyuta

---

## 15. Tasdiqlash

- [x] 1–6-bo'limlar (funksional doira) tasdiqlandi
- [x] 7–9-bo'limlar (arxitektura, stek, ma'lumotlar modeli) tasdiqlandi
- [x] 11-bo'lim — barcha savollarga javob berildi
- [x] 12-bo'lim — edge case'lar ro'yxati to'liq deb topildi
- [x] 10-bo'lim — bosqichlar tartibi tasdiqlandi → **0-bosqichdan kod yozishni boshlaymiz**

---

## 16. Amalga oshirish jurnali

| Bosqich | Holat | Izoh |
|---|---|---|
| 0 — Fundament | ✅ | ADR-0001…0004 |
| 1 — Identity + bot | ✅ | ADR-0005 |
| 2 — Catalog + Search | ✅ | Geography, Owner arizasi, onboarding, admin ko'rigi, boshqaruv menyusi, qidiruv, kartochka, sevimlilar |
| 3 — Schedule & Pricing | ✅ | Hafta kunlari, istisno kunlar, narx qoidalari, bo'sh slotlar (Availability), "Bo'sh maydon topish", "Hozir bo'sh", kartochkada bo'sh vaqtlar to'ri |
| 4 — Booking (core) | ✅ | So'rovlar navbati, kontakt almashinuvi, tasdiqlash/rad etish, slot-lock'lar (50 parallel → 1 g'olib), qo'lda bandlov, blok, bekor qilish, NO_SHOW, muddat/yakunlash fon jarayoni, "Mening bandlovlarim", "Yana bandlash" |
| 5 — Notifications + Jobs | ✅ | BullMQ yetkazish navbati (rate limit, 429, 403 → bloklangan), eslatma 2 soat oldin, Owner'ga eslatma 10 daqiqa oldin, kunlik jadval 21:00 — ADR-0006 |
| 6 — Reviews + Reputation | ✅ | Bandlovdan keyin baholash (1–5, izoh, 7 kun tahrir), Owner javobi, shikoyat + avto-moderatsiya, stadion reytingi kartochkada, o'yinchi ishonchliligi (NO_SHOW/bekor qilish), maydon holati xabarlari (RV-8, 24 soat) |
| 6a — Marketing + Subscription | ✅ | `Subscription` konteksti + `FeatureGate` (FREE/PREMIUM jadvali), "Asoschi hamkor" 90 kun, `/premium` (qo'lda uzaytirish), muddat tugashidan 7/1 kun oldin eslatma; "Yangi polya" kampaniyasi (birlashtirish, 10:00–21:00, haftasiga 2 ta, 🔕 opt-out, statistika, bloklash > 2% — admin'ga); chegirma e'loni (PREMIUM, oyiga 4 ta, 10–50%, 24 soat, narx snapshot'iga kiradi); "⭐ Tavsiya etiladi" (sahifada ≤ 2); `SlotWatch` (navbat bilan, 10 daqiqa oraliq); PREMIUM rasm limiti 15 |
| 7 — Admin + Hardening | ✅ | Admin konteksti: `/blockuser`, `/blockvenue` (tasdiq bilan, bandlovlar bekor + xabar — EC-B10/B11), `/transfervenue` (EC-T10), `/stats` (AD-4); Staff (bir martalik taklif havolasi, FREE — 1 ta, so'rovlar va eslatmalar xodimlarga ham, darhol olib tashlash — EC-D3); jadval o'zgarganda ziddiyat ogohlantirishi (EC-S2/S3); kunlik jadvalni o'chirish; per-user rate limit (EC-D4); so'kinish filtri Unicode + `PROFANITY_EXTRA`; xatolar chegarasi + admin'ga ogohlantirish; backup/restore skriptlari; yuklama testi (40 parallel foydalanuvchi: p50 ≈ 94 ms, p95 ≈ 189 ms) |
| 8 — REST API + OpenAPI | ✅ | `/api/v1`: initData → JWT (access 15 daq., refresh 30 kun, rotatsiya + qayta ishlatishni aniqlash), `/me`, `/auth/logout`; ochiq katalog (`/cities`, `/venues` qidiruv cursor bilan, `/venues/:idOrSlug`, `/pitches/:id/slots`); o'yinchi bandlovlari (`POST /bookings` + `Idempotency-Key` — Redis, 24 soat, parallel takrorlar → 1 ta bandlov; `GET /bookings`, `GET /bookings/:id`, `POST /bookings/:id/cancel`) — bot bilan bir xil use case'lar va Owner xabarnomalari; xatolar RFC 9457, `code` bot bilan bir xil; OpenAPI 3.1 `/api/v1/openapi.json` — `@polya/contracts` reyestridan, e2e test har bir route hujjatda borligini tekshiradi |
| 8a — QA (tanqidiy test) | ✅ | Topilib tuzatilgan: BK-11/EC-B6 parallel so'rovlarda buzilardi (3 o'rniga 7 ta faol so'rov, kesishgan bandlovlar) — o'yinchi bo'yicha tranzaksion guard; refresh token parallel qayta ishlatilganda o'g'irlik sezilmasdi, logout bilan poygada oila tiklanardi — atomik Lua; EC-C2 (nofaol shaharda qidiruv va yangi stadion to'xtamasdi, ogohlantirish yo'q edi); ufqdan keyingi kunlar `FREE` ko'rinardi; Problem Details `status`ini domain tafsiloti bosib ketardi; REST'da rate limit yo'q edi (TZ 6); bot bitta foydalanuvchining parallel update'larini bir vaqtda bajarardi (ikki marta bosish, sessiya poygasi); xodim taklifini bir vaqtda qabul qilish xatoga tushardi |
| 9a — Render deploy (demo) | ✅ | `render.yaml` Blueprint (free web + Key Value `noeviction`, Atlas M0), `GET /health/ping`, `KeepAlive` (`KEEP_ALIVE_MINUTES`, tashqi URL orqali o'z-o'zini chaqirish), `PUBLIC_URL` ← `RENDER_EXTERNAL_URL`; qo'llanma `docs/deploy-render.md` |

### TZ'dan chetlanishlar (asoslangan)
| Joy | TZ | Amalda | Sabab |
|---|---|---|---|
| EC-O1 | Qoralama DB'da, 30 kun | Qoralama Redis sessiyasida, 7 kun (sessiya TTL) | Yarim to'ldirilgan stadion bazada "axlat" bo'lib qolmaydi; 4 ta maydon uchun yetarli |
| EC-O6 | Topilmagan so'rovlar Admin uchun yig'iladi | Strukturali log (`search.miss`) | Admin paneli (7-bosqich) shu log'dan hisobot oladi |
| 4.2 | Admin boshqaruvi bot orqali | Bot buyruqlari (`/admin`, `/cities`, `/addcity`, `/pending` ...) | Adminlar ichki xodim; to'liq web panel — v2 |
| 7.6, 4.6 | Delayed job'lar + Transactional Outbox | BullMQ — faqat yetkazish uchun; vaqt triggerlari holatdan (davriy tekshiruv + atomik flag) — ADR-0006 | Hamma triggerlar bandlov holatidan aniqlanadi; Outbox'siz ham "ko'pi bilan bir marta" kafolati |
| BK-3e | Navbat ≤ 3 | Parallel ikki so'rov kamdan-kam 4-chisini o'tkazib yuborishi mumkin | Navbat — yumshoq cheklov; double booking'ga ta'sir qilmaydi |
| SP-6, SP-7 | Stadion darajasida sozlanadi | Hozircha platforma standarti (14 kun, 30 daqiqa, maks. 4 soat) — `BookingPolicy` | Owner sozlamalari 4-bosqichda bandlov sozlamalari bilan birga |
| RV-2 | Mezonlar (yoritish, kiyinish xonasi...) va rasm | Faqat umumiy baho + matn | MVP uchun yetarli; mezonlar keyingi iteratsiyada |
| RV-8 | Holat xabari kartochkada | "Sharhlar" ro'yxati sarlavhasida | Kartochka qisqa qoladi; xabar 24 soat yashaydi |
| 7.2 (Search) | `SlotWatch` Search kontekstida | Booking kontekstida | Bo'shaganlik va EC-M7 (boshqa joyda bandlov) — bandlov holati; Booking'da tranzaksiyasiz va aylanma bog'liqliksiz |
| MK-2 | "Haftasiga 2 ta" | Sirpanuvchi 7 kun | Kalendar haftasi chegarasida 4 ta xabar ketib qolmaydi |
| 4.9 | Chegirma limiti "oyiga" | Sirpanuvchi 30 kun | Oy boshida limitlar "portlab" ketmaydi |
| 4.9 | Chegirma e'lonidagi "Bandlash" tugmasi | Stadion kartochkasini ochadi (bosish hisoblanadi, MK-7) | Kartochkada chegirmali narx va bo'sh vaqtlar to'ri bor; band bo'lsa — bandlash oqimi "band" deydi |
| EC-M5 | FREE'da faqat birinchi 5 ta rasm ko'rsatiladi | O'yinchiga hozircha faqat birinchi rasm ko'rsatiladi | Galereya v2; rasmlar o'chirilmaydi |
| 7 (Sentry) | Xatolar monitoringi — Sentry | Xatolar chegarasi + adminlarga Telegram ogohlantirishi (daqiqasiga 1 ta) + strukturali log | Self-hosted (ADR-0004), tashqi servisga ma'lumot chiqmaydi; Sentry/GlitchTip — keyin ixtiyoriy |
| 7 (load test) | Yuklama testi | Ilova ichidagi kechikish testi (Telegram tarmog'isiz) | Haqiqiy bot token'siz qayta ishlab chiqariladigan; tarmoq kechikishi Telegram'ga bog'liq |
| EC-B9 | Maydon MAINTENANCE'ga o'tkazilganda ro'yxat | Maydon holatini o'zgartirish UI'si hali yo'q | UI qo'shilganda `outsideSchedule` bilan bir xil ogohlantirish ishlatiladi |
| EC-S3 | Owner tasdig'idan keyin o'yinchilarga sabab bilan xabar | Ogohlantirish + "Bandlovlarni ko'rish" tugmasi; Owner har birini sabab bilan bekor qiladi (mavjud BK-6 oqimi) | Ommaviy bekor qilish xavfli; bittalab — aniq nazorat |
| EC-M5 | PREMIUM tugasa "qaysi xodim qoladi?" tanlovi, 7 kun | Mavjud xodimlar qoladi, yangisi qo'shilmaydi | Tanlov oqimi — keyingi iteratsiya |
| 3 (Staff ruxsatlari) | Owner har bir xodimga ruxsatlarni tanlaydi | Bitta standart to'plam: bandlovlar, qo'lda bandlov, blok | MVP uchun yetarli; `permissions` maydoni keyin |
| 5.2 | Sana → vaqt → lokatsiya → natija | Sana → vaqt → natija (shahar bo'yicha, arzonidan) | Lokatsiya so'rash qadamni uzaytiradi; masofa bo'yicha qidiruv "📍 Yaqin atrofdagi"da bor |
| 7.7 (REST qamrovi) | Bot use case'lari REST'da | 8-bosqichda faqat o'yinchi tomoni: kirish, katalog, bo'sh vaqtlar, bandlov so'rovi/bekor qilish | Mini App (9-bosqich) birinchi navbatda o'yinchi uchun; Owner/Admin paneli bot'da qoladi, REST'i Mini App bilan birga |
| 7.7 (cursor) | Cursor-based pagination | Cursor shaffof emas, ichida hozircha offset | Qidiruv natijasi bir nechta manbadan (yaqinlik + matn) birlashtiriladi — barqaror keyset yo'q; format API'ni buzmasdan almashtiriladi |
| 7.7 (OpenAPI) | Avtomatik generatsiya | `@nestjs/swagger` o'rniga `@polya/contracts`dagi route reyestri + `z.toJSONSchema` | Nest 12 uchun swagger/nestjs-zod hali yo'q (ADR-0003); sxemalar controller tekshiradigan Zod sxemalarining o'zi, mos kelmaslikni e2e test ushlaydi |
| TZ 6 (rate limit) | Foydalanuvchiga ~30 so'rov/daqiqa | Bot — 30 update/daqiqa; REST — token egasiga 60/daqiqa, anonim IP'ga ×5 | Mini App sahifasi bir ochilishda 4–6 so'rov yuboradi; mobil operatorlarda ko'p abonent bitta IP ortida (CGNAT) |
| 5.4 (bot) | — | Bitta foydalanuvchi update'lari navbat bilan, jarayon ichida | Webhook bitta API instansiyasida; gorizontal kengaytirilsa Redis lock kerak |
| EC-C2 | Nofaol qilishdan oldin ogohlantirish | Umumiy ogohlantirish matni (stadion/bandlov soni ko'rsatilmaydi) | Geography Catalog'ga bog'lanmaydi (aylanma bog'liqlik); soni — keyingi iteratsiyada port orqali |
| 4.5 (reyting) | Reyting to'g'ri qayta hisoblanadi | Ikki sharh bir vaqtda kelsa, reyting keyingi sharhgacha bitta sharh orqada qolishi mumkin | Kamdan-kam holat, o'zi tuzaladi; ma'lum cheklov |
| Q10 (demo) | O'zbekistonda, Atlas yo'q | Demo/staging — Render (Frankfurt) + Atlas M0 | Tez va bepul ko'rsatish uchun; haqiqiy foydalanuvchi ma'lumotlari bilan produksiya — Q10 bo'yicha O'zbekistonda |
