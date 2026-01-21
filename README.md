# 🏥 Sistema de Gestión de Cotizaciones - Mainz Medical Spa

Sistema web para la gestión de cotizaciones de instrumental quirúrgico para hospitales, clínicas y organismos públicos.

## 📋 Requisitos Previos

- **Node.js** >= 16.0.0
- **MySQL** >= 8.0
- **npm** o **yarn**

## 🚀 Instalación

### 1. Instalar dependencias

```bash
cd mainz-backend-main
npm install
```

### 2. Configurar Base de Datos

#### a) Crear la base de datos

Ejecutar el script SQL en MySQL:

```bash
mysql -u root -p < ../Script/CREATE_DATABASE_CORRECTO.sql
```

O desde MySQL Workbench/phpMyAdmin, ejecutar el archivo `Script/CREATE_DATABASE_CORRECTO.sql`

#### b) Insertar datos de prueba

```bash
mysql -u root -p < ../Script/data_correcto.sql
```

### 3. Configurar variables de entorno

Copiar el archivo `.env.example` y renombrarlo a `.env`:

```bash
cp .env.example .env
```

Editar el archivo `.env` con tus credenciales de MySQL:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tu_password_aqui
DB_NAME=sistema_gestion
```

### 4. Iniciar el servidor

```bash
npm start
```

O en modo desarrollo (con auto-reload):

```bash
npm run dev
```

El servidor estará corriendo en: `http://localhost:3000`

## 📊 Estructura de la Base de Datos

El sistema utiliza **8 tablas** según el diagrama oficial:

1. **roles** - Roles de usuario (admin, vendedor, usuario)
2. **usuarios** - Usuarios del sistema
3. **clientes** - Clientes (hospitales, clínicas)
4. **categoriaproducto** - Categorías de productos médicos
5. **productos** - Catálogo de instrumental quirúrgico
6. **cotizaciones** - Cotizaciones generadas
7. **detallecotizacion** - Detalle de productos por cotización
8. **despacho** - Seguimiento de despachos

## 🔐 Autenticación

El sistema usa **JWT (JSON Web Tokens)** para autenticación.

### Usuarios de Prueba

| Usuario | Contraseña | Rol |
|---------|------------|-----|
| admin | password123 | admin |
| vendedor1 | password123 | vendedor |
| vendedor2 | password123 | vendedor |
| usuario1 | password123 | usuario |

### Login

```bash
POST http://localhost:3000/usuarios/login
Content-Type: application/json

{
  "usuario": "admin",
  "password": "password123"
}
```

Respuesta:
```json
{
  "mensaje": "Login exitoso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

## 📡 Endpoints de la API

### Usuarios

- `POST /usuarios/login` - Login (público)
- `POST /usuarios` - Crear usuario (admin)
- `GET /usuarios/perfil` - Ver perfil (autenticado)
- `GET /usuarios` - Listar usuarios (autenticado)
- `DELETE /usuarios/:id` - Eliminar usuario (admin)

### Clientes

- `GET /clientes` - Listar clientes (autenticado)
- `GET /clientes/:id` - Ver cliente (autenticado)
- `POST /clientes` - Crear cliente (admin)
- `PUT /clientes/:id` - Actualizar cliente (admin)
- `DELETE /clientes/:id` - Eliminar cliente (admin)

### Productos

- `GET /productos` - Listar productos (autenticado)
- `GET /productos/:id` - Ver producto (autenticado)
- `POST /productos` - Crear producto (admin)
- `PUT /productos/:id` - Actualizar producto (admin)
- `DELETE /productos/:id` - Eliminar producto (admin)

### Cotizaciones

- `GET /cotizaciones` - Listar cotizaciones (autenticado)
- `GET /cotizaciones/:id` - Ver cotización (autenticado)
- `POST /cotizaciones` - Crear cotización (autenticado)
- `PUT /cotizaciones/:id` - Actualizar cotización (admin)
- `DELETE /cotizaciones/:id` - Eliminar cotización (admin)

### Reportes

- `GET /reportes` - Generar reportes (admin)

## 🔒 Autorización

El sistema implementa control de acceso basado en roles:

- **admin**: Acceso completo (CRUD en todas las entidades)
- **vendedor**: Puede crear cotizaciones y ver información
- **usuario**: Solo lectura

## 📝 Ejemplo de Uso

### 1. Login

```bash
curl -X POST http://localhost:3000/usuarios/login \
  -H "Content-Type: application/json" \
  -d '{"usuario":"admin","password":"password123"}'
```

### 2. Crear Cliente (requiere token)

```bash
curl -X POST http://localhost:3000/clientes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_TOKEN_AQUI" \
  -d '{
    "rut": "12.345.678-9",
    "nombre": "Hospital Ejemplo",
    "correo": "contacto@hospital.cl"
  }'
```

### 3. Listar Productos con Paginación

```bash
curl -X GET "http://localhost:3000/productos?page=1&limit=10" \
  -H "Authorization: Bearer TU_TOKEN_AQUI"
```

## 🛠️ Tecnologías Utilizadas

- **Node.js** - Runtime de JavaScript
- **Express** - Framework web
- **MySQL2** - Cliente de MySQL
- **JWT** - Autenticación
- **Bcrypt** - Encriptación de contraseñas
- **CORS** - Control de acceso
- **Dotenv** - Variables de entorno

## 📁 Estructura del Proyecto

```
mainz-backend-main/
├── db/
│   └── db.js              # Conexión a MySQL
├── middleware/
│   ├── auth.js            # Verificación de JWT
│   └── roles.js           # Control de roles
├── routes/
│   ├── clientes.js        # Rutas de clientes
│   ├── cotizaciones.js    # Rutas de cotizaciones
│   ├── productos.js       # Rutas de productos
│   ├── reportes.js        # Rutas de reportes
│   └── usuarios.js        # Rutas de usuarios
├── .env                   # Variables de entorno (no subir a git)
├── .env.example           # Ejemplo de variables
├── index.js               # Servidor principal
├── package.json           # Dependencias
└── README.md              # Este archivo
```

## ⚠️ Notas Importantes

1. **Nunca subir el archivo `.env` a git** - Contiene credenciales sensibles
2. **Cambiar `JWT_SECRET`** en producción por una clave segura
3. **Usar HTTPS** en producción
4. **Configurar CORS** apropiadamente para tu dominio
5. **Hacer backups** regulares de la base de datos

## 🐛 Solución de Problemas

### Error: "Cannot connect to MySQL"

- Verifica que MySQL esté corriendo
- Revisa las credenciales en `.env`
- Verifica que la base de datos `sistema_gestion` exista

### Error: "Token requerido"

- Asegúrate de incluir el header: `Authorization: Bearer TU_TOKEN`
- Verifica que el token no haya expirado (24h por defecto)

### Error: "Acceso denegado"

- Verifica que tu usuario tenga el rol adecuado
- Algunas operaciones requieren rol `admin`

## 📞 Soporte

Para dudas o problemas, contactar a: **Ariel Ojeda**

## 📄 Licencia

ISC
