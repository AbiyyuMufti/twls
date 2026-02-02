import { Config } from "./config";

export class Repository {
  constructor(private config: Config) {}

  pull(): void {
    throw new Error("Method not implemented.");
  }

  push(): void {
    throw new Error("Method not implemented.");
  }
}
