// save-03: what the sign-in page says, from why the person was sent there (`motivo`) and the listing they were on.
export function loginReason(motivo: string | null, listingTitle: string | null) {
  const listing = listingTitle ? `«${listingTitle}»` : null;
  switch (motivo) {
    case "favorito":
      return { title: listing ? `Ingresa para guardar ${listing}` : "Ingresa para guardar tus favoritos", meta: "Lo guardamos apenas ingreses y lo verás en todos tus dispositivos." };
    case "favoritos":
      return { title: "Ingresa para ver tus favoritos en todos tus dispositivos", meta: "Los favoritos de este dispositivo se suman a tu cuenta al ingresar." };
    case "alerta":
      return { title: "Ingresa para crear tu alerta", meta: "La creamos apenas ingreses y te avisamos solo cuando aparezca algo nuevo." };
    case "reporte":
      return { title: listing ? `Ingresa para reportar ${listing}` : "Ingresa para enviar tu reporte", meta: "Al volver, el formulario estará abierto." };
    case "contacto":
      return { title: listing ? `Ingresa para contactar por ${listing}` : "Ingresa para contactar al vendedor", meta: "Volverás a la publicación apenas ingreses." };
    default:
      return listing
        ? { title: `Ingresa para continuar con ${listing}`, meta: "Volverás a la publicación apenas ingreses." }
        : { title: "Ingresar", meta: "Ingresa con tu contraseña o solicita un enlace seguro por correo." };
  }
}
