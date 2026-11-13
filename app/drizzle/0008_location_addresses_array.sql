CREATE TABLE `locations_next` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `addresses_json` text NOT NULL,
  `website_url` text,
  `lat` real,
  `lng` real
);
--> statement-breakpoint
INSERT INTO `locations_next` (`id`, `name`, `addresses_json`, `website_url`, `lat`, `lng`)
SELECT `id`, `name`, json_array(`address`), `website_url`, `lat`, `lng`
FROM `locations`;
--> statement-breakpoint
DROP TABLE `locations`;
--> statement-breakpoint
ALTER TABLE `locations_next` RENAME TO `locations`;
