/* ═══════════════════════════════════════════════════════════════
   N MARKET — backend_hardening_v10.sql
   Coordonnées GPS pour les livraisons hors campus, choisies via
   Apple Maps dans l'app iOS (recherche d'adresse ou point déposé
   sur le plan). Le site peut continuer à n'utiliser que
   delivery_address ; ces colonnes sont optionnelles.

   Idempotent : peut être exécuté plusieurs fois sans danger.
═══════════════════════════════════════════════════════════════ */

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lat        double precision;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lng        double precision;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_place_name text;

COMMENT ON COLUMN orders.delivery_lat        IS 'Latitude du point de livraison (hors campus), choisie via Apple Maps sur iOS';
COMMENT ON COLUMN orders.delivery_lng        IS 'Longitude du point de livraison (hors campus), choisie via Apple Maps sur iOS';
COMMENT ON COLUMN orders.delivery_place_name IS 'Nom court du lieu (ex: nom du quartier/POI) résolu par Apple Maps, pour affichage rapide côté vendeur';

/* Ces colonnes ne contiennent que des coordonnées GPS et un nom de lieu —
   aucune donnée sensible nouvelle, donc les mêmes GRANT que le reste de la
   table orders s'appliquent déjà (pas de révocation particulière ici). */
