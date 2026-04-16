# Application Comptable avec IA

Une application Next.js moderne pour la gestion comptable avec optimisation fiscale par IA, OCR pour l'extraction de texte des factures, et envoi automatique aux comptables par région.

## Fonctionnalités

- **OCR Intelligent** : Extraction automatique du texte des factures et documents
- **Optimisation Fiscale IA** : Conseils personnalisés via OpenAI pour optimiser la fiscalité
- **Envoi Automatique** : Transmission sécurisée des documents aux comptables par région
- **Gestion des Comptables** : Configuration des adresses email par région
- **Historique Complet** : Suivi de tous les envois et optimisations IA
- **Base de Données PostgreSQL** : Stockage persistant sur Neon

## Technologies Utilisées

- **Frontend** : Next.js 16, React 19, TypeScript, Tailwind CSS
- **OCR** : Tesseract.js
- **IA** : OpenAI GPT-4o-mini
- **Email** : Nodemailer avec SMTP
- **Base de Données** : PostgreSQL sur Neon
- **Déploiement** : Vercel (recommandé)

## Installation

1. **Cloner le projet**
   ```bash
   git clone <repository-url>
   cd compta
   ```

2. **Installer les dépendances**
   ```bash
   npm install
   ```

3. **Configuration des variables d'environnement**

   Créer un fichier `.env` à la racine du projet :

   ```env
   # Base de données PostgreSQL (Neon)
   DATABASE_URL=postgresql://username:password@hostname/database?sslmode=require

   # OpenAI API
   OPENAI_API_KEY=sk-your-openai-api-key

   # Configuration SMTP pour les emails
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=votre-email@gmail.com
   SMTP_PASS=votre-mot-de-passe-app
   FROM_EMAIL=votre-email@gmail.com

   # Emails des comptables par défaut (optionnel)
   ACCOUNTANT_EMAIL_FRANCE=comptable.france@example.com
   ACCOUNTANT_EMAIL_TOGO=comptable.togo@example.com
   ACCOUNTANT_EMAIL_VIETNAM=comptable.vietnam@example.com
   ACCOUNTANT_EMAIL_AUTRE=comptable@example.com
   ```

4. **Initialiser la base de données**
   ```bash
   npm run init-db
   ```

5. **Lancer l'application**
   ```bash
   npm run dev
   ```

   Ouvrir [http://localhost:3000](http://localhost:3000)

## Configuration de la Base de Données

### Neon (Recommandé)

1. Créer un compte sur [Neon](https://neon.tech)
2. Créer un nouveau projet
3. Copier l'URL de connexion PostgreSQL
4. L'ajouter dans `.env` comme `DATABASE_URL`

### Initialisation des Tables

Le script `init-db` crée automatiquement :
- `accountants` : Comptables par région
- `invoices` : Factures OCR
- `ai_optimizations` : Historique des optimisations IA
- `send_history` : Historique des envois email

## Configuration SMTP

### Gmail
1. Activer la vérification en 2 étapes
2. Générer un mot de passe d'application
3. Utiliser ces paramètres :
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=votre-email@gmail.com
   SMTP_PASS=mot-de-passe-app
   ```

### Autres Fournisseurs
Adapter les paramètres selon votre fournisseur SMTP.

## Utilisation

### Page Principale (`/`)
- **OCR** : Importer des images de factures pour extraire le texte
- **IA** : Demander des conseils d'optimisation fiscale
- **Envoi** : Transmettre les documents au comptable approprié

### Paramètres (`/settings`)
- Configurer les adresses email des comptables par région
- Les données sont sauvegardées dans la base de données

## APIs

- `POST /api/ai` : Optimisation fiscale via IA
- `POST /api/send-to-accountant` : Envoi d'emails avec pièces jointes
- `GET/POST /api/accountants` : Gestion des comptables

## Déploiement

### Vercel (Recommandé)

1. Pousser le code sur GitHub
2. Connecter le repository à Vercel
3. Ajouter les variables d'environnement dans les paramètres Vercel
4. Déployer

### Autres Plateformes

L'application est compatible avec toute plateforme supportant Next.js :
- Netlify
- Railway
- Render
- etc.

## Sécurité

- Les clés API sont stockées dans les variables d'environnement
- Connexion SSL obligatoire pour PostgreSQL
- Validation des entrées utilisateur
- Gestion d'erreurs appropriée

## Support

Pour toute question ou problème, créer une issue sur le repository GitHub.

## Licence

MIT
