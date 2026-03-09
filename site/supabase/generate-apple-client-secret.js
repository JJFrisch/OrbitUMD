// generate-apple-client-secret.js

import fs from 'fs'
import jwt from 'jsonwebtoken'

// Fill these in with your actual values
const teamId = 'M2ZV7F454Z'        // Apple Developer Team ID
const clientId = 'com.orbitumd.web' // Services ID
const keyId = 'B4J4683233'         // Key ID you just created
const privateKey = fs.readFileSync('./AuthKey_B4J4683233.p8', 'utf8') // path to your .p8

const now = Math.floor(Date.now() / 1000)

// Apple allows up to 6 months; here use 180 days
const expiration = now + 180 * 24 * 60 * 60

const token = jwt.sign(
  {
    iss: teamId,
    iat: now,
    exp: expiration,
    aud: 'https://appleid.apple.com',
    sub: clientId
  },
  privateKey,
  {
    algorithm: 'ES256',
    keyid: keyId
  }
)

console.log(token)
 // npm install jsonwebtoken
 // node generate-apple-client-secret.js

 
