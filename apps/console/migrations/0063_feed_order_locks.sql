-- The feeds' order (ADR-0125): two tables that hold no row and are there to be locked, in a schema
-- of their own that nobody but the console's role may use. A role that may use a schema may lock
-- a table in it without any right on the table (a statement prepared over it holds a lock until
-- its transaction ends), and a plugin's role may use "public". A new schema gives nobody a right;
-- the revoke says so where whoever keeps the database set default privileges.
CREATE SCHEMA "feed_order";
--> statement-breakpoint
REVOKE ALL ON SCHEMA "feed_order" FROM PUBLIC;
--> statement-breakpoint
CREATE TABLE "feed_order"."events" (
	"nothing" boolean,
	CONSTRAINT "events_empty" CHECK (false)
);
--> statement-breakpoint
CREATE TABLE "feed_order"."plugin_events" (
	"nothing" boolean,
	CONSTRAINT "plugin_events_empty" CHECK (false)
);
--> statement-breakpoint
-- The reader's side: whether no writer of a feed is under way, asked by locking the feed's table
-- alone, without waiting. PostgreSQL takes no LOCK TABLE outside a transaction block, and a
-- transaction a process opened for it would hold the lock for a round trip, or for as long as
-- that process stalls, with every writer waiting behind it. Inside a function the lock is had and
-- given up within the one statement that calls it, and a lock that is refused is an answer, not
-- an error in the log. Written by hand: the schema's generator knows no functions.
CREATE FUNCTION "feed_order"."writers_ended"("feed" text) RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
	IF feed = 'console' THEN
		LOCK TABLE "feed_order"."events" IN EXCLUSIVE MODE NOWAIT;
	ELSIF feed = 'plugin' THEN
		LOCK TABLE "feed_order"."plugin_events" IN EXCLUSIVE MODE NOWAIT;
	ELSE
		RAISE EXCEPTION 'no such feed: %', feed;
	END IF;
	RETURN true;
EXCEPTION WHEN lock_not_available THEN
	RETURN false;
END
$$;
--> statement-breakpoint
-- Whoever may connect may call a function unless told otherwise: nobody but its owner calls this.
REVOKE ALL ON FUNCTION "feed_order"."writers_ended"(text) FROM PUBLIC;
