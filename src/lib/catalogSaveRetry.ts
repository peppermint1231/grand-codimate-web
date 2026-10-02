import type { Command, Catalog } from "../core/model";
/** Memory-only retry identity. Never silently writes price data to device storage. */
export class CatalogSaveRetry {
  private attempts = new Map<string, { signature: string; command: Command }>();
  get(command: Command, owner: string): Command {
    if (!command.type.startsWith("catalog.")) return command;
    const slot =
      owner +
      ":" +
      command.type +
      ":" +
      ((command.payload.catalog as Catalog | undefined)?.book || "");
    const signature = JSON.stringify({
      payload: command.payload,
      baseRev: command.baseRev,
      entityId: command.type === "catalog.apply" ? undefined : command.entityId,
    });
    const prior = this.attempts.get(slot);
    if (prior?.signature === signature) return prior.command;
    const copy = structuredClone(command);
    this.attempts.set(slot, { signature, command: copy });
    return copy;
  }
  forget(id: string) {
    for (const [slot, value] of this.attempts)
      if (value.command.id === id) this.attempts.delete(slot);
  }
}
