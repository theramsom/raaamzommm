# Study Hub

Study Hub es una aplicación web para estudiantes que centraliza la organización académica, el control del tiempo de estudio y la gestión de tareas en una sola interfaz. Su propósito es facilitar la planificación personal, mejorar la productividad y ofrecer apoyo educativo mediante una herramienta visual, clara y funcional.

> [!IMPORTANT]
> Este proyecto funciona como un prototipo académico y de productividad orientado a uso personal o educativo, con una experiencia moderna y un asistente de IA para apoyo didáctico.

## Descripción general

La plataforma combina una interfaz amigable con funcionalidades de organización estudiantil, permitiendo:

- administrar tareas por prioridad, materia y fecha,
- monitorizar horas de estudio,
- registrar ideas y apuntes rápidos,
- personalizar el perfil del estudiante,
- consultar dudas académicas con un asistente basado en IA.

## Funciones destacadas

> [!TIP]
> La sección más importante de la aplicación es su conjunto de funciones académicas y de productividad, diseñadas para sostener la organización diaria del estudiante.

### 1. Gestión de tareas

- Crear tareas con nombre, materia, prioridad, fecha y descripción.
- Marcar tareas como completadas o pendientes.
- Eliminar elementos no deseados.
- Filtrar por estado y categoría.

### 2. Control del tiempo de estudio

- Registrar sesiones de estudio.
- Visualizar métricas generales de rendimiento.
- Monitorear el progreso académico de forma rápida.

### 3. Pizarra interactiva

- Anotar ideas, conceptos o apuntes rápidos.
- Mantener una libreta visual para actividades mentales o esquemas.

### 4. Perfil de estudiante

- Editar datos personales del usuario.
- Personalizar la experiencia académica dentro de la app.

### 5. Asistente de IA

- Resolver dudas educativas mediante consultas en lenguaje natural.
- Brindar apoyo para conceptos, procedimientos y explicaciones académicas.

### 6. Guardado y copias de seguridad

- Las tareas, horas, actividad, pizarra y perfiles personales se guardan en el navegador.
- Las clases se guardan en el backend: en un archivo local durante las pruebas o en Supabase cuando se configura el modo en la nube.
- **Perfil → Copia de seguridad** exporta y restaura los datos locales del navegador. No exporta ni borra las clases compartidas del backend.

El archivo de copia puede contener nombres, correos y datos académicos; guárdalo en
un lugar privado. La copia no sincroniza tareas ni perfiles entre dispositivos.

## Características principales

- Landing page moderna y visualmente limpia.
- Navegación por secciones dentro de la aplicación.
- Interfaz responsiva y centrada en la experiencia del usuario.
- Panel administrativo con opciones de gestión académica.
- Backend con Express para integración con IA.

## Stack tecnológico

- HTML5
- CSS3
- JavaScript vanilla
- Node.js
- Express
- OpenAI API
- Dotenv
- CORS

## Estructura del proyecto

```text
mipaginawebrecuperación/
├── index.html                # Página principal
├── css.css                   # Estilos del frontend
├── app.js                    # Lógica del frontend
├── backend/
│   ├── .env.example          # Plantilla de variables de entorno
│   ├── package.json          # Dependencias del backend
│   ├── schema.sql            # Tabla para clases compartidas en Supabase
│   └── server.js             # Servidor Express, clases e IA
└── README.md                 # Documentación del proyecto
```

El frontend mantiene cada tecnología en su propio archivo: `index.html` contiene
la estructura, `css.css` los estilos y `app.js` la lógica de la aplicación. El
backend permanece separado en `backend/`.

## Inicio rápido

### 1) Ejecutar la interfaz web

Puedes abrir el proyecto de dos maneras:

- haciendo doble clic sobre `index.html`, o
- creando un servidor local desde la carpeta del proyecto.

Ejemplo:

```bash
python -m http.server 8000
```

Después accede a:

```text
http://localhost:8000
```

### 2) Ejecutar el backend local

Desde la carpeta `backend`:

```bash
npm install
```

Opcionalmente, crea un archivo `.env` tomando como referencia `.env.example`.
No necesitas una clave de OpenAI para probar la gestión de clases. El backend
guarda las clases en `backend/data/classes.json` mientras no esté configurado
Supabase:

```env
PORT=3000
```

Luego inicia el backend:

```bash
npm start
```

La API quedará disponible en:

```text
http://localhost:3000
```

En el frontend, el valor inicial de `<meta name="study-hub-api">` apunta a
`http://localhost:3000`. Al publicar el frontend, cambia su contenido por la URL
pública del backend, por ejemplo `https://tu-backend.example.com`.

### 3) Compartir clases por Internet con Supabase

El archivo JSON local solo comparte clases entre usuarios que se conecten al mismo
backend local. Para que estén disponibles por Internet:

1. Crea un proyecto de Supabase y ejecuta [`backend/schema.sql`](./backend/schema.sql) en el SQL Editor.
2. En las variables privadas del servicio donde alojes el backend, configura `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` con los valores de tu proyecto. Nunca pongas la clave `service_role` en `index.html`, `app.js` ni en el frontend publicado.
3. Aloja el backend con Node.js 18 o posterior y actualiza la etiqueta `study-hub-api` del frontend con la URL pública del backend.

Si las variables de Supabase están configuradas, las clases se guardan en la nube;
si no, se usa el archivo local. Las cuentas de esta versión son perfiles locales,
no una autenticación segura: las clases no guardan los correos de los estudiantes,
pero cualquiera que obtenga un código puede intentar unirse.

## Uso del asistente IA

El backend expone un endpoint para responder preguntas educativas:

```http
POST /api/ia
```

Ejemplo de solicitud JSON:

```json
{
  "pregunta": "Explícame cómo resolver una ecuación de segundo grado paso a paso."
}
```

## Requisitos del proyecto

- Navegador moderno.
- Node.js instalado.
- Clave válida de OpenAI solo si se quiere utilizar el asistente IA.

## Nota del proyecto

> [!WARNING]
> Study Hub se encuentra en una etapa beta y está diseñado como un prototipo funcional para uso educativo y académico. Su almacenamiento en navegador y la integración con IA son apropiados para demostración, pruebas y aprendizaje.

## Mejoras futuras

- Integración con base de datos real.
- Autenticación y perfiles de usuario más completos.
- Mejoras de UX/UI y experiencia visual.
- Personalización avanzada del asistente IA.
- Exportación de reportes y estadísticas académicas.

## Licencia

Este proyecto se distribuye con fines educativos y de aprendizaje. Puede adaptarse, reutilizarse y modificarse libremente según las necesidades del usuario.

---

## Resumen ejecutivo

Study Hub se presenta como una herramienta académica práctica y visual, ideal para estudiantes que desean organizar su tiempo, controlar sus tareas y obtener ayuda rápida en sus actividades de estudio. Su estructura sencilla, su enfoque didáctico y sus funciones integradas lo convierten en una propuesta útil tanto como prototipo funcional como base para futuras mejoras.
