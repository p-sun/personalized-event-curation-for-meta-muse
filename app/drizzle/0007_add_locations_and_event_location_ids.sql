CREATE TABLE `locations` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `address` text NOT NULL,
  `website_url` text,
  `lat` real,
  `lng` real
);
--> statement-breakpoint
INSERT INTO `locations` (`id`, `name`, `address`, `website_url`, `lat`, `lng`)
SELECT
  'location:' || lower(hex(`venue`)),
  `venue`,
  min(`address`),
  CASE
    WHEN `venue` = 'Times Square, Broadway & 45th St' THEN 'https://www.timessquarenyc.org/things-to-do/full-schedule'
    WHEN `venue` IN ('34th Street / Herald Square', '34th Street district', 'Herald Square Park') THEN 'https://34thstreet.org/calendar/week'
    ELSE NULL
  END,
  max(`lat`),
  max(`lng`)
FROM `events`
GROUP BY `venue`;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `location_id` text;
--> statement-breakpoint
UPDATE `events`
SET `location_id` = (
  SELECT `locations`.`id`
  FROM `locations`
  WHERE `locations`.`name` = `events`.`venue`
  LIMIT 1
);
--> statement-breakpoint
CREATE INDEX `events_location_id_idx` ON `events` (`location_id`);
