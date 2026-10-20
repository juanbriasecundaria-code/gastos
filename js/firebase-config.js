/* =========================================================================
   CONFIGURACIÓN DE FIREBASE (login + sincronización entre dispositivos)
   -------------------------------------------------------------------------
   Ya está completada con el proyecto de Firebase real. Si en algún momento
   necesitás cambiar de proyecto, reemplazá el objeto de abajo por el que
   te muestre la consola de Firebase (Configuración del proyecto > tu app
   web > firebaseConfig), y no te olvides de:
   - Activar Authentication > Correo electrónico/contraseña
   - Crear Firestore Database (modo producción)
   - Publicar estas reglas en Firestore > Reglas:

      rules_version = '2';
      service cloud.firestore {
        match /databases/{database}/documents {
          match /gastosUsuarios/{userId} {
            allow read, write: if request.auth != null && request.auth.uid == userId;
          }
        }
      }
   ========================================================================= */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBtbslgNngi9eRFaM18tnw5L4rd0IfgSXk",
  authDomain: "gastos-cec25.firebaseapp.com",
  projectId: "gastos-cec25",
  storageBucket: "gastos-cec25.firebasestorage.app",
  messagingSenderId: "315119458786",
  appId: "1:315119458786:web:54a33f1667e320b8be41bb"
};

// AUTH_MODE: 'username' = login con nombre de usuario (sin recuperar contraseña por email).
//            'email'    = login con email real (permite "olvidé mi contraseña").
window.AUTH_MODE = 'username';

