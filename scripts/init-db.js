#!/usr/bin/env node

/**
 * Préférez `npx prisma db push` pour aligner les tables sur prisma/schema.prisma.
 * Ce script fixe le search_path (comme lib/postgres.ts) pour que les DDL
 * ciblent le même schéma que Prisma (ex. ?schema=compta sur Neon).
 */

const { Pool } = require('pg');
require('dotenv').config();

function sanitizePgIdent(name) {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) ? name : undefined;
}

function prismaSchemaFromUrl(url) {
  const fromEnv = process.env.DATABASE_SCHEMA?.trim();
  if (fromEnv) return sanitizePgIdent(fromEnv);
  if (!url) return undefined;
  const m = url.match(/[?&]schema=([^&]+)/);
  const raw = m ? decodeURIComponent(m[1]) : undefined;
  return raw ? sanitizePgIdent(raw) : undefined;
}

const prismaSchema = prismaSchemaFromUrl(process.env.DATABASE_URL || '');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  ...(prismaSchema ? { options: `-c search_path=${prismaSchema},public` } : {}),
});

async function createTables() {
  try {
    console.log('Connexion à la base de données...');
    if (prismaSchema) {
      await pool.query(`CREATE SCHEMA IF NOT EXISTS ${prismaSchema}`);
    }

    // Créer la table accountants
    await pool.query(`
      CREATE TABLE IF NOT EXISTS accountants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        region VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) NOT NULL,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );
    `);

    // Créer la table invoices
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        filename VARCHAR(255),
        ocr_text TEXT,
        "createdAt" TIMESTAMP DEFAULT NOW()
      );
    `);

    // Créer la table users
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );
    `);

    // Créer la table ai_optimizations
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_optimizations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" TEXT,
        "invoiceId" UUID REFERENCES invoices(id),
        prompt TEXT,
        response TEXT,
        region VARCHAR(50),
        "createdAt" TIMESTAMP DEFAULT NOW()
      );
    `);

    // Créer la table send_history
    await pool.query(`
      CREATE TABLE IF NOT EXISTS send_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        region VARCHAR(50),
        "recipientEmail" VARCHAR(255),
        message TEXT,
        "filesCount" INTEGER,
        "sentAt" TIMESTAMP DEFAULT NOW(),
        success BOOLEAN,
        error TEXT
      );
    `);

    console.log('Tables créées avec succès !');

    // Insérer des données par défaut pour les comptables
    await pool.query(`
      INSERT INTO accountants (region, email) VALUES
      ('france', 'comptable.france@example.com'),
      ('togo', 'comptable.togo@example.com'),
      ('vietnam', 'comptable.vietnam@example.com'),
      ('autre', 'comptable@example.com')
      ON CONFLICT (region) DO NOTHING;
    `);

    console.log('Données par défaut insérées !');

  } catch (error) {
    console.error('Erreur lors de la création des tables:', error);
  } finally {
    await pool.end();
  }
}

createTables();