# Diagrammes UML — Rapport de Stage Bridger (PlantUML)

## Comment générer les images

### Option 1 : PlantUML Online
Copier le contenu de chaque fichier `.puml` dans : https://www.plantuml.com/plantuml/uml

### Option 2 : VS Code Extension
Installer l'extension "PlantUML" dans VS Code, puis Ctrl+Shift+P → "PlantUML: Export Current File Diagrams"

### Option 3 : Ligne de commande
```bash
java -jar plantuml.jar diagrams/*.puml -o output/
```

---

## Liste des diagrammes par chapitre

### Chapitre 1 — Etude Prealable
| # | Fichier | Description |
|---|---------|-------------|
| 1 | `00-gantt-planning.puml` | Diagramme de Gantt — Planning previsionnel |

### Chapitre 2 — Sprint 1 : Specification et Conception
| # | Fichier | Description |
|---|---------|-------------|
| 2 | `01-use-case-global.puml` | Diagramme de cas d'utilisation global |
| 3 | `02-class-diagram-global.puml` | Diagramme de classes global (toutes entites) |
| 4 | `03-architecture-deployment.puml` | Architecture de deploiement (microservices) |
| 5 | `04-architecture-3tiers.puml` | Architecture 3-tiers |

### Chapitre 3 — Sprint 2 : Authentification et KYC
| # | Fichier | Description |
|---|---------|-------------|
| 6 | `05-uc-sprint2-global.puml` | Cas d'utilisation global Sprint 2 |
| 7 | `06-uc-sprint2-register.puml` | Raffinement "S'inscrire via WhatsApp OTP" |
| 8 | `07-uc-sprint2-kyc.puml` | Raffinement "Verification KYC Biometrique" |
| 9 | `08-seq-auth-otp.puml` | Sequence "Authentification OTP WhatsApp" |
| 10 | `09-seq-face-verification.puml` | Sequence "Verification Faciale IA (ArcFace)" |
| 11 | `10-activity-kyc-process.puml` | Activite "Processus KYC complet" |

### Chapitre 4 — Sprint 3 et 4 : Espaces Expediteur et Voyageur
| # | Fichier | Description |
|---|---------|-------------|
| 12 | `11-uc-sprint3-global.puml` | Cas d'utilisation global Sprint 3 (Expediteur) |
| 13 | `12-uc-sprint3-create-deal.puml` | Raffinement "Creer une annonce de colis" |
| 14 | `13-seq-create-deal-matching.puml` | Sequence "Publication annonce + Matching" |
| 15 | `14-seq-qr-delivery-confirmation.puml` | Sequence "Confirmation livraison QR code" |
| 16 | `15-uc-sprint4-global.puml` | Cas d'utilisation global Sprint 4 (Voyageur) |
| 17 | `16-uc-sprint4-create-trip.puml` | Raffinement "Creer un trajet" |
| 18 | `17-uc-sprint4-manage-deals.puml` | Raffinement "Gerer les deals recus" |
| 19 | `18-seq-accept-deal.puml` | Sequence "Acceptation d'un deal" |
| 20 | `29-activity-sender-flow.puml` | Activite "Flux complet Expediteur" |
| 21 | `30-activity-traveler-flow.puml` | Activite "Flux complet Voyageur" |

### Chapitre 5 — Sprint 5 : Messagerie, Paiement, Avis, Litiges
| # | Fichier | Description |
|---|---------|-------------|
| 22 | `19-uc-sprint5-global.puml` | Cas d'utilisation global Sprint 5 |
| 23 | `20-uc-sprint5-messaging.puml` | Raffinement "Messagerie temps reel" |
| 24 | `21-uc-sprint5-payment-wallet.puml` | Raffinement "Paiement Escrow et Wallet" |
| 25 | `22-uc-sprint5-review.puml` | Raffinement "Evaluation post-livraison" |
| 26 | `23-uc-sprint5-dispute.puml` | Raffinement "Ouvrir un litige" |
| 27 | `24-seq-realtime-chat.puml` | Sequence "Messagerie temps reel Socket.io" |
| 28 | `25-seq-escrow-payment.puml` | Sequence "Paiement Escrow + Liberation" |
| 29 | `27-seq-dispute.puml` | Sequence "Ouverture et resolution d'un litige" |
| 30 | `28-seq-notification-push.puml` | Sequence "Notifications Push" |
| 31 | `26-activity-deal-lifecycle.puml` | Activite "Cycle de vie complet d'un Deal" |
