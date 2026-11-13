export const MAX_NUMBERED_FILTERED_ITEMS = 99;

export type NumberedFilteredItem<T> = {
  item: T;
  /** Stable rank among every unique event in the current filtered result. */
  eventNumber: number;
  /** The card/pin label; intentionally hidden after the first 99 events. */
  displayNumber: number | null;
};

/**
 * Numbers unique events by their first appearance in an already-deterministic
 * occurrence order. Every occurrence of an event receives the same number,
 * while the full eventNumber remains available after visible labels stop at 99.
 */
export function numberFilteredItems<T>(
  items: T[],
  getEventKey: (item: T, index: number) => string = (_item, index) => String(index),
): Array<NumberedFilteredItem<T>> {
  const eventNumbers = new Map<string, number>();
  let nextEventNumber = 1;

  return items.map((item, index) => {
    const eventKey = getEventKey(item, index);
    let eventNumber = eventNumbers.get(eventKey);
    if (eventNumber === undefined) {
      eventNumber = nextEventNumber;
      eventNumbers.set(eventKey, eventNumber);
      nextEventNumber += 1;
    }

    return {
      item,
      eventNumber,
      displayNumber: eventNumber <= MAX_NUMBERED_FILTERED_ITEMS ? eventNumber : null,
    };
  });
}
