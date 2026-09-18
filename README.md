# Dashboard Authentication System

A comprehensive Node.js Express application with multi-factor authentication and user management dashboard.

## Features

- **Multi-Factor Authentication**
  - Email/Password login
  - PIN-based authentication
  - Fingerprint simulation (ready for real biometric integration)
  
- **Dashboard & User Management**
  - Admin dashboard with statistics
  - User management (add, edit, delete users)
  - Role-based access control (admin/user)
  - No public registration - only admins can add users

- **Security Features**
  - bcrypt password encryption
  - Session management with PostgreSQL
  - CSRF protection
  - Rate limiting
  - Login attempt logging

## Prerequisites

- Node.js (v16 or higher)
- PostgreSQL database
- npm or yarn

## Installation

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Database Setup**
   - Create a PostgreSQL database named `AADataBase`
   - Update the `.env` file with your database credentials:
   ```
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=AADataBase
   DB_USER=postgres
   DB_PASSWORD=your_db_password
   ```

3. **Environment Configuration**
   - Copy `.env.example` to `.env` (if needed)
   - Update the session secret and database credentials

4. **Run the Application**
   ```bash
   # Development mode with auto-restart
   npm run dev
   
   # Production mode
   npm start
   ```

5. **Access the Application**
   - Open your browser to `http://localhost:3000`
   - - On first run, create your own admin account via the database seed script (see below)

## Database Schema

The application automatically creates the following tables:
- `users` - User accounts with authentication data
- `session` - Session storage
- `login_attempts` - Security audit log

## Authentication Methods

### 1. Password Authentication
- Standard email/password login
- Required for all users
- Passwords encrypted with bcrypt

### 2. PIN Authentication
- 4-6 digit numeric PIN
- Optional secondary authentication
- AJAX-based login

### 3. Fingerprint Authentication
- Simulated fingerprint scanner
- Ready for real biometric integration
- Stored as hashed fingerprint data

## User Roles

- **Admin**: Full access to dashboard and user management
- **User**: Basic dashboard access

## API Endpoints

### Authentication
- `GET /auth/login` - Login page
- `POST /auth/login/password` - Password authentication
- `POST /auth/login/pin` - PIN authentication  
- `POST /auth/login/fingerprint` - Fingerprint authentication
- `POST /auth/logout` - Logout

### Dashboard
- `GET /dashboard` - Main dashboard
- `GET /dashboard/users` - User management (admin only)
- `GET /dashboard/users/add` - Add user form (admin only)
- `POST /dashboard/users/add` - Create user (admin only)
- `GET /dashboard/users/:id/edit` - Edit user form (admin only)
- `POST /dashboard/users/:id/edit` - Update user (admin only)
- `POST /dashboard/users/:id/delete` - Delete user (admin only)

## Security Features

- **Password Encryption**: All passwords encrypted with bcrypt (salt rounds: 12)
- **Session Security**: Secure session management with PostgreSQL storage
- **CSRF Protection**: All forms protected against CSRF attacks
- **Rate Limiting**: Login attempt rate limiting (5 attempts per 15 minutes)
- **Input Validation**: Server-side validation with express-validator
- **SQL Injection Protection**: Parameterized queries with pg

## File Structure

```
├── models/
│   ├── database.js      # Database connection and initialization
│   └── User.js          # User model with authentication methods
├── routes/
│   ├── auth.js          # Authentication routes
│   └── dashboard.js     # Dashboard and user management routes
├── middleware/
│   └── auth.js          # Authentication middleware
├── views/
│   ├── auth/
│   │   └── login.ejs    # Multi-tab login page
│   ├── dashboard/
│   │   ├── index.ejs    # Main dashboard
│   │   ├── users.ejs    # User management
│   │   ├── add-user.ejs # Add user form
│   │   └── edit-user.ejs# Edit user form
│   └── partials/        # Reusable EJS components
├── public/
│   ├── css/
│   │   └── style.css    # Custom styles
│   └── js/
│       ├── app.js       # General JavaScript
│       └── login.js     # Login page functionality
└── server.js            # Main application file
```

## Development

- **Auto-restart**: Use `npm run dev` for development with nodemon
- **Debugging**: Console logs for authentication attempts and errors
- **Testing**: Test all three authentication methods with the default admin account

## Production Deployment

1. Set `NODE_ENV=production` in environment
2. Use HTTPS and set `secure: true` for session cookies
3. Update session secret to a strong random value
4. Configure PostgreSQL with connection pooling
5. Set up reverse proxy (nginx) if needed

## Admin Account Setup

No default admin credentials are shipped with this repository. Create your first admin account using the database seed script, or manually insert a user record with `role = 'admin'` and a bcrypt-hashed password.

**Important**: Always use a strong, unique password and change it periodically.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the ISC License.