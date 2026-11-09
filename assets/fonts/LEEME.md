# Fuentes

La app busca estos archivos (si faltan, usa la fuente del sistema y sigue funcionando):

| Archivo | Uso |
|---|---|
| `PetrovSans-Regular.woff2` | Fuente principal: cuerpo |
| `PetrovSans-SemiBold.woff2` | Destacados, botones y subtítulos |
| `PetrovSans-Bold.woff2` | Títulos |
| `HurmeGeometricSans4-Bold-numeros.woff2` | Números, en toda la app (solo dígitos) |
| `Outfit-Variable.woff2` | Respaldo libre (OFL) |

## Petrov Sans (Fontfabric)

Generada desde los `.otf` de **Petrov Sans Trial** con fontTools: subconjunto latino (cubre á, é, ñ, ü, ¿, ¡, €)
convertido a `woff2`, y **ensanchado al 106 % en horizontal** (contornos, anchos y kerning), que es la
escala horizontal de la marca. Por eso en CSS el interletrado va en 0 y no se usa ningún `transform`.
El número de Hurme también está ensanchado al 106 %. Si cambiás los archivos, repetí ese paso.

**Ojo con la licencia:** la versión *Trial* de Fontfabric es para pruebas. Antes de publicar la app
(o si el repo de GitHub es público), comprá la licencia web de Petrov Sans y reemplazá estos tres archivos
por los de la versión completa, con los mismos nombres. Si no, la app usa Outfit.

## Hurme Geometric Sans No. 4 (solo números)

Es una fuente comercial: revisá que tu licencia incluya uso web antes de subirla a un repo público.

## Outfit (respaldo, licencia SIL OFL 1.1)

`Outfit-Variable.woff2` (pesos 100–900, subconjunto latino). Origen: `@fontsource-variable/outfit@5.3.0`.
La licencia está en `OFL-Outfit.txt` y tiene que acompañar al archivo.
