# Google Play — szervezeti igazolás (Magyarország)

Ez a lépés a Play Console-ban jelenik meg, ha **szervezetként** (organization) regisztrálsz, nem magánszemélyként:

> „Szükségünk lesz egy dokumentumra, amely tartalmazza a szervezet cégbejegyzését”

A Google **egyet** kér ezek közül (PDF / JPG / PNG, olvasható, aktuális).

---

## Elfogadott dokumentumok

| Magyar név | Angol (Google) | Hol szerzed |
|---|---|---|
| **Cégbejegyzési okirat vagy tanúsítvány** | Certificate of incorporation / registration | Cégbíróság / e-Cégjegyzék |
| **Cégkivonat** | Commercial register extract | e-Cégjegyzék (leggyakoribb) |
| **Áfaregisztrációs tanúsítvány** | VAT registration certificate | NAV |

**Ajánlott (HU Kft / Bt / Zrt):** friss **cégkivonat** az e-Cégjegyzékből.

---

## 1. Cégkivonat (leggyorsabb út)

1. Menj ide: [https://www.e-cegjegyzek.hu](https://www.e-cegjegyzek.hu)  
2. Keresd a céget **cégnév** vagy **adószám / cégjegyzékszám** alapján.  
3. Válaszd a **cégkivonat** / hivatalos kivonat letöltését (hitelesített / elektronikus példány).  
4. Mentsd **PDF**-ként.  
5. Ellenőrizd, hogy látszik rajta:
   - teljes cégnév (ugyanaz, mint a Play Console-ban)
   - székhely
   - cégjegyzékszám
   - adószám
   - kiállítás dátuma (lehetőleg **90 napnál nem régebbi**)

Ha nincs még céged: magánszemélyként (individual) is lehet Play fejlesztői fiókot nyitni — akkor **nem** kell cégirat. Organization fiókhoz viszont kell.

---

## 2. Cégbejegyzési okirat / tanúsítvány

- A cégbírósági bejegyzéskor kapott okirat, vagy  
- az e-Cégjegyzékről kérhető bejegyzési tanúsítvány / másolat.  
Használd, ha a cégkivonat nem elérhető, de a bejegyzési papír megvan.

---

## 3. Áfaregisztrációs tanúsítvány (NAV)

1. [https://www.nav.gov.hu](https://www.nav.gov.hu) / Ügyfélkapu / eSZJA / céges adóügyek  
2. Keress **áfa-regisztráció** / közösségi adószám / adószám igazolást.  
3. Csak akkor válaszd, ha a cég **áfa-alany**, és a dokumentumon egyértelműen szerepel a szervezet neve + adószám.

---

## Mit vár el a Google a feltöltésnél

- **Név egyezés:** a dokumentumon lévő cégnév = a Play Console „Organization name” mező.  
- **Olvastható:** ne legyen levágva, homályos fotó; inkább PDF.  
- **Érvényes:** ne lejárt / nagyon régi kivonat.  
- **Egy dokumentum** elég (ne tölts fel irreleváns szerződést, számlát, személyi igazolványt helyette).  
- A fiók **D-U-N-S** / cím adatoknak is egyezniük kell a cégiratokkal (ha a Google később kéri).

---

## Nexus / Play Console checklist

- [ ] Play Console → szervezetként regisztrálva  
- [ ] Organization name = hivatalos cégnév  
- [ ] Feltöltött irat: cégkivonat **vagy** bejegyzési okirat **vagy** áfa-tanúsítvány  
- [ ] Alkalmazás package: `hu.qyopy.nexus`  
- [ ] Aláírt **AAB** (Android workflow + keystore secretek)  
- [ ] Adatvédelmi tájékoztató URL (pl. `https://nexusproject.cc/...`)  
- [ ] Store listing: cím, leírás, screenshotok  

Utána a képernyőn: **Következő** → töltsd fel a PDF-et → várd meg a Google ellenőrzését (általában napok, néha 1–2 hét).

---

## Ha elutasítják

Gyakori okok:
- cégnév nem egyezik a fiók nevével  
- magánszemély neve van a dokumentumon, de organization a fiók  
- rossz / hiányos / lejárt kivonat  
- nem a listán szereplő irattípus  

Javítsd a nevet a Console-ban **vagy** tölts fel frissebb cégkivonatot, és küldd újra.

---

## Magánszemély vs. szervezet

| | Individual | Organization |
|---|---|---|
| Cégirat kell? | Nem | Igen (ez a képernyő) |
| App kiadó neve | Saját neved / brand | Hivatalos cégnév |
| Javaslat indie-nek | Egyszerűbb start | Kell, ha cégként adod ki a Nexust |

Ha nincs magyar cégbejegyzésed, válaszd az **egyéni (individual)** fejlesztői fiókot, vagy előbb alapíts / használd a meglévő céget, és azzal verdifikáld a szervezetet.

---

## English summary (for Google support tickets)

Google Play is requesting **one official document** proving your organization’s legal registration in Hungary:

1. Certificate of incorporation / registration (*cégbejegyzési okirat vagy tanúsítvány*)  
2. Commercial register extract (*cégkivonat*) — **recommended** from [e-cegjegyzek.hu](https://www.e-cegjegyzek.hu)  
3. VAT registration certificate (*áfaregisztrációs tanúsítvány*) from NAV  

Upload a clear PDF. The legal name on the document must match the Organization name in Play Console. Then tap **Next** (*Következő*) and wait for verification.
