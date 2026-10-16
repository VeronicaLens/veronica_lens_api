# Astro Core

O Astro Core oferece cálculos astronômicos puros e independentes de HTTP, banco de dados, UI e
fornecedores externos.

## Conversão RA/Dec para Alt/Az

```ts
import { equatorialToHorizontal } from '../src/modules/astronomy/index.js';

const horizontal = equatorialToHorizontal({
  equatorial: {
    rightAscensionDegrees: 108.024542,
    declinationDegrees: 23.019056,
  },
  observedAt: new Date('2026-09-06T00:00:00.000Z'),
  observer: {
    latitudeDegrees: -23.5505,
    longitudeDegrees: -46.6333,
    elevationMeters: 760,
  },
});
```

Convenções:

- RA e Dec são recebidas em graus.
- Latitude norte e longitude leste são positivas.
- `Date` representa um instante; offsets de timezone equivalentes produzem o mesmo resultado.
- Azimute cresce para leste a partir do norte verdadeiro: norte 0°, leste 90°.
- Altitude geométrica varia de -90° a +90° e não inclui refração atmosférica.
- RA/Dec devem ser coordenadas aparentes correspondentes ao epoch da observação. Precessão, nutação,
  paralaxe e movimento próprio são responsabilidades da efeméride que fornece as coordenadas. O
  adapter JPL solicita explicitamente `QUANTITIES=2` para não misturar ICRF/J2000 com Alt/Az da data.
- A elevação é mantida no contrato do observador para compatibilidade com efemérides topocêntricas;
  ela não altera esta transformação angular esférica.

## Precisão

O tempo sideral segue a aproximação publicada pelo United States Naval Observatory. O MVP usa UTC
como aproximação de UT1; isso mantém o núcleo offline e determinístico, com precisão adequada para
orientação visual, mas não para apontamento científico de alta precisão. Uma evolução que exija
precisão sub-segundo deverá consumir UT1 e dados de rotação terrestre do IERS.

Referências:

- https://aa.usno.navy.mil/faq/GAST
- https://docs.astropy.org/en/stable/api/astropy.coordinates.AltAz.html
