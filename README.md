# Ganesh Pickles Backend

Phase 6 adds the Node.js, Express, MongoDB, and Mongoose backend foundation for Ganesh Pickles, including secure customer authentication with short-lived access tokens and HTTP-only refresh-token cookies.

## Prerequisites

- Node.js 18 or newer
- npm
- MongoDB running locally or a MongoDB connection string
- The existing React frontend in `../frontend`

## Installation

```bash
cd backend
npm install
```

## Environment Setup

Create `backend/.env` from `.env.example` and replace both JWT secrets with long random values.

```bash
cp .env.example .env
```

Required variables:

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/ganesh_pickles
FRONTEND_URL=http://localhost:5173
JWT_ACCESS_SECRET=replace_with_a_long_random_access_secret
JWT_REFRESH_SECRET=replace_with_a_long_random_refresh_secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
REFRESH_COOKIE_DAYS=7
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_PRODUCT_FOLDER=ganesh-pickles/products
CLOUDINARY_UPLOAD_PRESET=ganesh_products_signed
```

Never expose JWT secrets or `CLOUDINARY_API_SECRET` to the React frontend. Never commit `.env`.

## MongoDB Local Setup

Start MongoDB locally, then keep `MONGODB_URI` as:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/ganesh_pickles
```

The API connects to MongoDB before it starts accepting requests. If MongoDB or a required environment variable is missing, startup fails with a clear message.

## Commands

Development:

```bash
npm run dev
```

Production:

```bash
npm start
```

Seed products:

```bash
npm run seed
```

## Authentication Endpoints

Base URL:

```text
http://localhost:5000/api
```

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /auth/me`
- `POST /auth/logout`

## Product Endpoints

Public:

- `GET /products`
- `GET /products/featured`
- `GET /products/bestsellers`
- `GET /products/new-arrivals`
- `GET /products/slug/:slug`
- `GET /products/:id`

Admin only:

- `GET /products/admin/all`
- `GET /products/admin/:id`
- `POST /products`
- `PUT /products/:id`
- `PATCH /products/:id/status`
- `DELETE /products/:id`

Admin upload endpoints:

- `POST /uploads/product-signature`
- `DELETE /uploads/product-image`

Product listing supports `page`, `limit`, `search`, `category`, `flavour`, `spiceLevel`, `featured`, `bestseller`, `newArrival`, `inStock`, `minPrice`, `maxPrice`, and `sort`.

Admin product listing supports `page`, `limit`, `search`, `status`, `category`, `featured`, `bestseller`, `newArrival`, `inStock`, and `sort`. The admin-only product-by-ID endpoint can return inactive products for editing; the public product-by-ID endpoint still returns only active products.

Supported sort values:

```text
featured
popularity
price-asc
price-desc
rating
name-asc
name-desc
newest
```

## Example Request Bodies

Register:

```json
{
  "fullName": "Customer Name",
  "email": "customer@example.com",
  "phone": "9876543210",
  "password": "ExamplePassword@123"
}
```

Login:

```json
{
  "email": "customer@example.com",
  "password": "ExamplePassword@123"
}
```

Create product as admin:

```json
{
  "name": "Sample Mango Pickle",
  "shortDescription": "Tangy mango pickle with a balanced chilli finish.",
  "description": "Editable sample product copy for testing product creation through the admin API.",
  "image": "/images/products/mango-pickle.jpg",
  "images": ["/images/products/mango-pickle.jpg"],
  "media": [
    {
      "url": "https://res.cloudinary.com/your_cloud_name/image/upload/v1234567890/ganesh-pickles/products/mango-pickle.jpg",
      "publicId": "ganesh-pickles/products/mango-pickle",
      "alt": "Traditional mango pickle jar",
      "isPrimary": true,
      "sortOrder": 0
    }
  ],
  "flavour": "Mango Chilli",
  "category": "Mango",
  "spiceLevel": "Hot",
  "ingredients": ["Mango", "Mustard", "Chilli", "Oil", "Salt"],
  "highlights": ["Tangy mango pieces", "Balanced heat"],
  "usageSuggestions": ["Serve with rice", "Pair with dosa"],
  "shelfLife": "6 months from packing",
  "storageInstructions": "Store in a cool, dry place and use a clean, dry spoon.",
  "featured": false,
  "bestseller": false,
  "newArrival": true,
  "rating": 0,
  "reviewCount": 0,
  "variants": [
    {
      "label": "250 g",
      "grams": 250,
      "price": 149,
      "originalPrice": 169,
      "stock": 20,
      "sku": "GPM-SAMPLE-250"
    }
  ]
}
```

Patch product status as admin:

```json
{
  "isActive": false
}
```

`GET /auth/me` requires:

```text
Authorization: Bearer ACCESS_TOKEN_FROM_LOGIN_OR_REFRESH
```

`POST /auth/refresh` reads only the HTTP-only `ganesh_refresh_token` cookie. Do not send refresh tokens in JSON.

## Postman Testing Guide

1. Health check: `GET http://localhost:5000/api/health`
2. Register: `POST /api/auth/register` with the register JSON body
3. Current user: `GET /api/auth/me` with `Authorization: Bearer <access token>`
4. Logout: `POST /api/auth/logout`
5. Login: `POST /api/auth/login` with the login JSON body
6. Refresh access token: `POST /api/auth/refresh` using the cookie Postman stored
7. Current user again: `GET /api/auth/me` with the new access token
8. Invalid-password test: login with a wrong password and expect a generic failure
9. Duplicate-account test: register the same email or phone again and expect a duplicate-account response
10. Missing-token test: call `GET /api/auth/me` without an access token and expect `401`

In Postman, enable the cookie jar for `localhost` so the refresh cookie is retained between login/register and refresh requests.

## Product API Testing Guide

1. Seed products: `npm run seed`
2. Get all products: `GET /api/products`
3. Search mango: `GET /api/products?search=mango`
4. Filter by category: `GET /api/products?category=Mango`
5. Filter by spice level: `GET /api/products?spiceLevel=Hot`
6. Filter by price: `GET /api/products?minPrice=150&maxPrice=350`
7. Sort by price: `GET /api/products?sort=price-asc`
8. Get featured products: `GET /api/products/featured`
9. Get bestsellers: `GET /api/products/bestsellers`
10. Get new arrivals: `GET /api/products/new-arrivals`
11. Get product by slug: `GET /api/products/slug/traditional-tender-mango-pickle`
12. Get invalid slug: `GET /api/products/slug/not-a-real-product`
13. Get product by ID: `GET /api/products/:id`
14. Create product without authentication: `POST /api/products`
15. Create product as a customer: `POST /api/products`
16. Create product as admin: `POST /api/products`
17. Update product: `PUT /api/products/:id`
18. Patch product status: `PATCH /api/products/:id/status`
19. Soft-delete product: `DELETE /api/products/:id`
20. Confirm inactive product disappears from public API: `GET /api/products/slug/:slug`

Admin requests require:

```text
Authorization: Bearer ACCESS_TOKEN_FOR_ADMIN_USER
```

Development-only admin role workflow:

1. Register a normal customer account.
2. Open MongoDB Compass.
3. Find the user document in the `users` collection.
4. Change `role` from `customer` to `admin`.
5. Log out and log back in so the access token contains the updated role.

Do not create a public make-admin endpoint and do not store real access tokens in documentation.

## Cloudinary Product Image Uploads

Admin product images are sent to Express as `multipart/form-data` and uploaded to Cloudinary from the backend. Files remain in memory only; no permanent local upload directory is used.

Cloudinary account setup:

1. Create a Cloudinary account and copy the cloud name, API key, and API secret into `backend/.env`.
2. Use `CLOUDINARY_PRODUCT_FOLDER=ganesh-pickles/products` so product public IDs are scoped to one controlled folder.
3. Never add the API secret to a frontend `VITE_` environment variable.

Allowed product image formats:

- JPEG
- PNG
- WebP

Maximum file size: 5 MB per image. Maximum product media: 5 images total.

Upload endpoint flow:

1. `POST /api/products` and `PUT /api/products/:id` accept a JSON `product` field and up to five `images` file fields.
2. Backend verifies the admin JWT, MIME type, filename extension, file signature, size, and count.
3. Express streams each in-memory file to `ganesh-pickles/products` and stores its secure URL and public ID.
4. Updates retain submitted media, append new files, and delete removed Cloudinary assets after MongoDB saves successfully.
5. Product deletion removes Cloudinary assets first and then removes the MongoDB product.

Product media structure:

```json
{
  "media": [
    {
      "url": "https://res.cloudinary.com/your_cloud_name/image/upload/v123/ganesh-pickles/products/example.webp",
      "publicId": "ganesh-pickles/products/example",
      "alt": "Traditional mango pickle jar",
      "isPrimary": true,
      "sortOrder": 0
    }
  ]
}
```

Security notes:

- Product create, update, upload, and deletion are admin-only.
- The Cloudinary API secret is used only by the backend.
- The frontend never receives the API secret and must not define it with a `VITE_` prefix.
- Upload folder, file type, file size, media count, URL host, public IDs, and primary image count are validated server-side.
- Removed Cloudinary assets are deleted after product update succeeds.
- Product deletion fails safely if its Cloudinary assets cannot be deleted.

Troubleshooting:

- `Image upload is currently unavailable`: confirm all Cloudinary environment variables are set and restart the backend.
- `Choose a JPEG, PNG or WebP image`: the MIME type is not allowed.
- `Each image must be smaller than 5 MB`: compress the image or choose a smaller file.
- `401` or `403`: log in again with an admin account.

Admin testing checklist:

1. Start MongoDB.
2. Start backend with Cloudinary variables in `backend/.env`.
3. Start frontend.
4. Log in as admin.
5. Open `/admin/products/new`.
6. Select JPEG, PNG, and WebP images.
7. Try an unsupported file and a file above 5 MB.
8. Try more than five images.
9. Select a primary image, reorder images, add alt text, and save.
10. Confirm MongoDB stores `media`, `image`, and `images`.
11. Confirm product cards, details, cart, checkout, and admin table show the primary image.
12. Edit the product, add an image, remove one image, save, and confirm removed Cloudinary assets are cleaned up.
13. Delete a test product and confirm its Cloudinary assets are gone.
14. Confirm unauthenticated users receive `401` and non-admin users receive `403` for product mutations.
15. Run the frontend build.

## Admin Panel

Frontend admin routes:

- `/admin`
- `/admin/products`
- `/admin/products/new`
- `/admin/products/:id/edit`
- `/admin/not-authorized`

Admins use the normal customer login page. The frontend checks the restored user role for user experience, while backend admin APIs remain protected with `protect` and `requireRole("admin")`.

## Security Notes

- Passwords are hashed with bcrypt before storage.
- Passwords, refresh-token hashes, and tokens are never returned in user objects.
- Access tokens are short-lived and returned in JSON for React memory only.
- Refresh tokens are stored only in an HTTP-only cookie named `ganesh_refresh_token`.
- MongoDB stores only a SHA-256 hash of the current refresh token.
- Refresh-token rotation happens on login, registration, and refresh.
- Refresh-token reuse clears the stored hash and rejects the request.
- CORS allows only `FRONTEND_URL` with credentials.
- Helmet, request size limits, auth rate limiting, inactive-user checks, and centralized error handling are enabled.
- Production error responses do not include stack traces or internal database details.

## Frontend Connection

The frontend already calls:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/refresh`
- `GET /api/auth/me`

Set the frontend API base URL when needed:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

Auth requests must use `credentials: "include"` so the browser sends the HTTP-only refresh cookie. The frontend should keep the access token in React memory and should not store refresh tokens or JWT secrets.

## Remaining Backend Phases

- Product catalog API backed by MongoDB
- Cart persistence for signed-in users
- Checkout and order models
- PhonePe Standard Checkout order creation and payment verification
- Customer order history
- Admin product, inventory, and order management
- Email/SMS notifications
- Address book and shipping rules
