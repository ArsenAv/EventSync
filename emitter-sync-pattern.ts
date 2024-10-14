/* Check the comments first */

import { EventEmitter } from "./emitter";
import { EventDelayedRepository } from "./event-repository";
import { EventStatistics } from "./event-statistics";
import { ResultsTester } from "./results-tester";
import {awaitTimeout, triggerRandomly} from "./utils";

const MAX_EVENTS = 1000;

enum EventName {
  EventA = "A",
  EventB = "B",
}

const EVENT_NAMES = [EventName.EventA, EventName.EventB];

/*

  An initial configuration for this case

*/

function init() {
  const emitter = new EventEmitter<EventName>();

  triggerRandomly(() => emitter.emit(EventName.EventA), MAX_EVENTS);
  triggerRandomly(() => emitter.emit(EventName.EventB), MAX_EVENTS);

  const repository = new EventRepository();
  const handler = new EventHandler(emitter, repository);

  const resultsTester = new ResultsTester({
    eventNames: EVENT_NAMES,
    emitter,
    handler,
    repository,
  });
  resultsTester.showStats(20);
}

/* Please do not change the code above this line */
/* ----–––––––––––––––––––––––––––––––––––––---- */

/*

  The implementation of EventHandler and EventRepository is up to you.
  Main idea is to subscribe to EventEmitter, save it in local stats
  along with syncing with EventRepository.

  The implementation of EventHandler and EventRepository is flexible and left to your discretion.
  The primary objective is to subscribe to EventEmitter, record the events in `.eventStats`,
  and ensure synchronization with EventRepository.

  The ultimate aim is to have the `.eventStats` of EventHandler and EventRepository
  have the same values (and equal to the actual events fired by the emitter) by the
  time MAX_EVENTS have been fired.

*/
class EventHandler extends EventStatistics<EventName> {
  repository: EventRepository;

  constructor(emitter: EventEmitter<EventName>, repository: EventRepository) {
    super();
    this.repository = repository;

    emitter.subscribe(EventName.EventA, () => this.handleEvent(EventName.EventA));
    emitter.subscribe(EventName.EventB, () => this.handleEvent(EventName.EventB));

    emitter.subscribe(EventName.EventA, () => this.handleReository(EventName.EventA));
    emitter.subscribe(EventName.EventB, () => this.handleReository(EventName.EventB));

  }

  private async handleReository(eventName: EventName) {
    await this.repository.saveEventData(eventName)
    this.repository.run();
  }
  private handleEvent(eventName: EventName) {
  const currentCount = this.getStats(eventName) + 1;
  this.setStats(eventName, currentCount);
}
}



export class EventRepository extends EventDelayedRepository<EventName> {
  eventIsPassed: boolean;
  synced: boolean;

  awaitUntilHandler: boolean;
  allEvents: Map<EventName, number>;
  syncedEvents: Map<EventName , boolean>;

  constructor() {
    super();
    this.eventIsPassed = true;
    this.synced = false;
    this.awaitUntilHandler = false;
    this.allEvents = new Map<EventName, number>();
    this.syncedEvents = new Map<EventName, boolean>();
  }

  run() {
    setInterval(() => this.SyncEvents(), 2000)
  }

  addEvent(eventName: EventName) {
    const count = (this.allEvents.get(eventName) || 0);

    if(!(this.syncedEvents.get(eventName) || false)) {
      this.setStats(eventName,this.getStats(eventName) + 1);
    } else {
      this.allEvents.set(eventName, count + 1);
    }
  }

  async SyncEvents() {
    if (!this.eventIsPassed) return;
    this.eventIsPassed = false;

    const allRequests: Array<Promise<void>> = [];
    for (let i = 0; i < EVENT_NAMES.length; i++) {
      const eventName = EVENT_NAMES[i];
      if (eventName) {
        allRequests.push(this.updateRequest(eventName));
      }
    }

    Promise.all(allRequests).then(() => {
      for (let i = 0; i < EVENT_NAMES.length; i++) {
        const eventName = EVENT_NAMES[i];
        if (eventName) {
          this.syncedEvents.set(eventName, true);
        }
      }
      this.eventIsPassed = true;
    });
  }
  getEventCount(eventName : EventName) : number
  {
    return this.allEvents.get(eventName) || 0;
  }
  async saveEventData(eventName: EventName) {
    this.addEvent(eventName);
    await this.updateRequest(eventName);
  }
  async updateRequest(eventName: EventName) {
    if (!this.awaitUntilHandler) {
      let count = this.getEventCount(eventName);
      if (count == 0) return;

      try {
        this.allEvents.set(eventName, 0);

        if(!(this.syncedEvents.get(eventName) || false)) {
          await this.updateEventStatsBy(eventName, 0);
        } else {
          await this.updateEventStatsBy(eventName, count);
        }
      } catch (errorMessage) {
        await this.handleError(errorMessage, eventName, count);
      }
    } else {
      await this.awaitUntil(eventName);
    }
  }
  async handleError(errorMessage: string, eventName: EventName, count: number) {
    if (errorMessage !== "Response delivery fail") {
      this.allEvents.set(eventName, (this.allEvents.get(eventName) || 0) + count);
    }

    if (errorMessage === "Request fail") {
      await this.updateRequest(eventName);
    } else if (errorMessage === "Too many requests") {
      this.awaitUntilHandler = true;
      await awaitTimeout(100);
      this.awaitUntilHandler = false;

      await this.updateRequest(eventName);
    }
  }

  async awaitUntil(eventName : EventName) {
    while (this.awaitUntilHandler) {
      await awaitTimeout(100);
    }
    await this.updateRequest(eventName);
  }
}



init();
