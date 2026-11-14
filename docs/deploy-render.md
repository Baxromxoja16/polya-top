# Render'ga deploy (free tarif)

Demo / staging uchun. Produksiya hostingi — TZ Q10 (O'zbekiston, self-hosted Mongo RS).

## Tarkib

| Qism | Qayerda | Tarif |
|---|---|---|
| API + Telegram bot (webhook) | Render Web Service, `apps/api/Dockerfile` | Free |
| Redis (sessiya, lock, BullMQ) | Render Key Value, `noeviction` | Free |
| MongoDB | MongoDB Atlas M0 (replica set, tranzaksiyalar ishlaydi) | Free |

Hammasi `render.yaml` (Blueprint) da yozilgan.

## 1. MongoDB Atlas

1. Atlas → **M0** cluster (region: Frankfurt, Render bilan bir xil).
2. Database Access → foydalanuvchi + parol.
3. Network Access → `0.0.0.0/0` (Render free'da doimiy chiquvchi IP yo'q).
4. Connect → Drivers → URI, oxiriga baza nomi: `mongodb+srv://USER:PASS@cluster0.xxxx.mongodb.net/polya?retryWrites=true&w=majority`

## 2. Render Blueprint

1. Render Dashboard → **New → Blueprint** → `Baxromxoja16/polya-top`, branch `main`.
2. Render `sync: false` qiymatlarini so'raydi:
   - `MONGO_URI` — Atlas URI
   - `TELEGRAM_BOT_TOKEN` — @BotFather
   - `TELEGRAM_WEBHOOK_SECRET` — `openssl rand -hex 32`
   - `ADMIN_TELEGRAM_IDS` — o'z ID'ingiz (@userinfobot)
3. **Apply**. `JWT_SECRET` avtomatik yaratiladi, `REDIS_URL` Key Value'dan olinadi,
   `PUBLIC_URL` = Render bergan `RENDER_EXTERNAL_URL` (`https://polya-api.onrender.com`).
4. Tekshirish: `https://<servis>.onrender.com/health` → `{"status":"ok",...}`.
   Bot ishga tushganda webhook o'zi o'rnatiladi.

## Keep-alive (uxlab qolmaslik)

Free web service 15 daqiqa kiruvchi trafik bo'lmasa uxlaydi — sweep, eslatmalar va BullMQ to'xtaydi.
`KEEP_ALIVE_MINUTES=10` bo'lsa ilova o'zini `GET ${PUBLIC_URL}/health/ping` orqali har 10 daqiqada
chaqiradi (Render proksisi orqali — kiruvchi trafik hisoblanadi).

Zaxira (ixtiyoriy): agar servis qayta ishga tushish payti va h.k. tufayli uxlab qolsa, o'zini
uyg'ota olmaydi. Ishonch uchun tashqi monitor (UptimeRobot, cron-job.org — bepul) ni
`/health/ping`ga 5–10 daqiqa oraliqda qo'ying.

## Free tarif cheklovlari

- **750 soat/oy** workspace bo'yicha — bitta servis 24/7 (~744 soat) sig'adi, ikkinchi free servis sig'maydi.
- **Key Value free — xotirada, diskka saqlanmaydi.** Restart'da sessiyalar, rate limit hisoblagichlari,
  `Idempotency-Key`lar va navbatdagi xabarnomalar yo'qoladi. Bandlovlar Mongo'da — ular yo'qolmaydi.
  Hajm 25 MB.
- Web service 512 MB RAM, 0.1 CPU — demo yuklamasi uchun yetarli.
- Disk yo'q (fayl saqlanmaydi) — ilova faylga yozmaydi.
- Build har push'da `main`dan avtomatik.
