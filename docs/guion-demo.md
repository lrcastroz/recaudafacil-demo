# Guion de demostración

Duración sugerida: 10 a 15 minutos. Antes de empezar ejecute `npm run reset-db` y luego `npm run dev` para partir de datos limpios. Active **Modo rápido** en el panel de fallas si la demo es corta.

## Preparación

- **Una pantalla (laptop/proyector):** abra `/kiosk?mode=frame&totem=TOT-001` y, en otra pestaña, `/admin`.
- **Monitor táctil + tablet:** en el monitor, `/kiosk?mode=kiosk&totem=TOT-001` en pantalla completa (F11). En la tablet, `http://<ip-del-equipo>:5173/simulator?totem=TOT-001`.

En el modo marco, todo objeto de la billetera (monedas, billetes, tarjetas y planillas) se puede **arrastrar** a su ranura o **pulsar** para usarlo directamente.

## 1. Pago de luz en efectivo con vuelto (≈3 min)

1. Toque la pantalla → **Luz**. Como CentroSur es la única distribuidora, el tótem pide directamente el CUEN.
2. Digite `0195063866` o, en la billetera, pestaña **Planillas**, pulse **Escanear** en esa cuenta de CentroSur. El tótem consulta y muestra 3 planillas, las anteriores vencidas.
3. Desmarque la última planilla para mostrar que el pago es en orden cronológico, vuelva a marcarla y pulse **Pagar**.
4. Resumen (comisión + IVA 15 %) → **Continuar** → **Consumidor final**.
5. **Efectivo**: inserte una moneda de 25¢ y luego billetes de $20. Muestre:
   - Las ranuras se iluminan sólo cuando el aceptador está habilitado.
   - El billete pasa por *validando → escrow → apilando* (panel de eventos).
   - Un billete de $2 o $50 se devuelve: "no aceptado".
6. Al cubrir el total: confirmación con la empresa, vuelto en la bandeja, impresión del ticket. Pulse el ticket para verlo o descargar el PDF y **Retirar** para vaciar la bandeja.

## 2. Pago de teléfono con tarjeta (≈2 min)

1. **Realizar otro pago** → **Internet** → **Yiga5**, cédula del titular `0907164826` (3 planillas). Como Internet tiene dos empresas, el tótem muestra la pantalla de selección.
2. **Tarjeta**: pestaña **Tarjetas**, VISA terminada en 1111 → **Insertar**.
3. Digite el PIN `1234` en el PIN pad y pulse la tecla verde. La pantalla del tótem sólo muestra puntos, nunca los dígitos.
4. Retire la tarjeta (botón **RETIRAR** del lector) para continuar.
5. Variante sin PIN: con un monto menor a $50, use **Acercar** (contactless).

## 2b. Pago en línea con botón de pagos (≈3 min)

1. Abra `/pagos` (también desde el celular). Elija **Agua → EPMAPA-SD**, abra **Cuentas de prueba** y elija `2290365`.
2. Revise las planillas → **Continuar** → **Consumidor final**, ingrese un correo, acepte los términos y pulse **Pagar … con tarjeta**.
3. Se abre la pasarela **PagoSeguro**: el comercio no ve los datos de la tarjeta. Muestre el resumen, el tiempo de expiración y la vista previa de la tarjeta con detección de marca.
4. En **Tarjetas de prueba** elija la Mastercard •••• 4444 y pulse **Pagar**. Aparece la verificación 3-D Secure del banco: ingrese `123456`. Un código incorrecto permite reintentar.
5. Pago aprobado: la pasarela regresa al comercio con el comprobante, el PDF y la factura enviada al correo.
6. Variantes:
   - Visa •••• 1111: aprobada sin 3-D Secure.
   - Visa •••• 0002: fondos insuficientes; puede reintentar con otra tarjeta (máximo 3 intentos).
   - Una fecha vencida se rechaza con código 54.
   - **Cancelar y volver al comercio**: muestra la transacción cancelada.
7. En `/admin` filtre por **WEB-001 · Portal web** para ver estos pagos junto a los de los tótems.

## 3. Manejo de errores (≈4 min)

| Escenario | Cómo provocarlo | Qué se observa |
|---|---|---|
| Fondos insuficientes | Tarjeta VISA •••• 0002 | Código 51, opciones: otra tarjeta, efectivo o cancelar |
| PIN incorrecto | Cualquier PIN distinto de 1234 | Reintento (máx. 3), luego declinada con código 55 |
| Banda en tarjeta con chip | **Deslizar** cualquier tarjeta | "Su tarjeta tiene chip: insértela" |
| Sin vuelto | Falla **Sin vuelto** + billete mayor al faltante | Billete devuelto desde escrow; sólo valor exacto |
| Billete falso / atasco | **Próximo billete → No reconocido / Atasco** | Devolución o billetero fuera de servicio (despejar desde el panel) |
| Empresa caída (efectivo) | Falla **Empresa sin respuesta** | Se devuelve todo el dinero ingresado |
| Empresa caída (tarjeta) | Misma falla, pagando con tarjeta | Reverso automático (MTI 0400) |
| Atasco del dispensador | Falla **Atasco del dispensador** + pago con vuelto | Vuelto parcial; el resto queda como saldo a favor en la cuenta |
| Sin papel | Falla **Impresora sin papel** | Pago OK, se muestra el número de comprobante |
| Cancelación | **Cancelar y devolver** durante el pago en efectivo | Devolución exacta de lo ingresado |
| Inactividad | No tocar la pantalla 60 s | Aviso con cuenta regresiva y regreso al inicio |

## 4. Consola de recaudación (≈3 min)

1. `/admin` (admin / admin123). El **Dashboard** se actualiza en vivo con cada pago.
2. **Transacciones**: abra la transacción recién pagada: desglose, movimientos de efectivo, intentos con tarjeta y ticket. Muestre el **reverso manual**.
3. **Tótems y efectivo**: estado de dispositivos, niveles del hopper/reciclador por denominación y caja fuerte. Haga **Cargar cambio** y un **Cierre de caja**.
4. **Configuración**: cambie la comisión o deshabilite el billete de $20; el tótem lo aplica al volver a la pantalla inicial.

## Cuentas de prueba (datos recién generados)

| Empresa | Código | Situación |
|---|---|---|
| **Luz · CentroSur** (CUEN, 10 dígitos) | `0122436833` | 2 planillas |
| | `0162157448` | 1 planilla |
| | `0195063866` | 3 planillas |
| | `0194349550` | 1 planilla |
| | `0171538842` | 2 planillas |
| | `0145872310` | 1 planilla + saldo a favor de $1,50 |
| | `0166819152` | Sin deuda |
| | `0137264519` | Cuenta suspendida |
| | `0158803326` | La empresa no responde a la consulta |
| **Agua · ETAPA EP** (cuenta, 6 dígitos) | `377611` | 2 planillas |
| | `395248` | 1 planilla |
| | `332461` | 3 planillas |
| | `346453` | 1 planilla |
| | `318204` | 2 planillas + saldo a favor de $1,50 |
| | `367278` | Sin deuda |
| | `354190` | Cuenta suspendida |
| **Agua · EPMAPA-SD** (cuenta, 7 dígitos) | `2304518` | 2 planillas |
| | `2311742` | 1 planilla |
| | `2290365` | 3 planillas |
| | `2287014` | 1 planilla + saldo a favor de $1,50 |
| | `2275590` | Sin deuda |
| | `2268831` | Cuenta suspendida |
| **Internet · ETAPA EP** (teléfono fijo, 9 dígitos) | `071317436` | 2 planillas |
| | `078368027` | 1 planilla |
| | `077087941` | 3 planillas |
| | `079317943` | 1 planilla |
| | `072845678` | 2 planillas |
| | `077318373` | Sin deuda |
| | `074512983` | Cuenta suspendida |
| **Internet · Yiga5** (cédula del titular, 10 dígitos) | `0912345675` | 1 planilla |
| | `0928451038` | 2 planillas |
| | `0907164826` | 3 planillas |
| | `0933805194` | Sin deuda |
| | `0919572644` | Cuenta suspendida |
| | `0944028711` | La empresa no responde a la consulta |

La lista completa está en la pestaña **Planillas** de la billetera (marco o simulador).

## Tarjetas de prueba (PIN `1234`)

| Tarjeta | Resultado |
|---|---|
| VISA •••• 1111 | Aprobada |
| Mastercard •••• 4444 | Aprobada |
| Diners •••• 0008 | Aprobada (sin contactless) |
| VISA •••• 0002 | Fondos insuficientes (51) |
| Mastercard •••• 5100 | Tarjeta expirada (54) |
| AMEX •••• 0005 | No autorizada (05) |
| Discover •••• 1117 | Emisor no disponible (91) |
