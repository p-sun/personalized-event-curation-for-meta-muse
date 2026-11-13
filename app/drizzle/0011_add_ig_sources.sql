CREATE TABLE `ig_sources` (
	`username` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`profile_url` text NOT NULL,
	`follower_count` integer,
	`verified` integer
);
