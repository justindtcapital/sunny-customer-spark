import { describe, expect, it } from "vitest";
import { moveColumn, orderedColumns } from "./column-order";

describe("editable table column order", () => {
  it("moves a selected field up and down without changing membership", () => {
    const columns = ["Owner", "Status", "Stakeholders"];
    expect(moveColumn(columns, "Stakeholders", "Owner")).toEqual(["Stakeholders", "Owner", "Status"]);
    expect(moveColumn(columns, "Owner", "Stakeholders")).toEqual(["Status", "Stakeholders", "Owner"]);
    expect(columns).toEqual(["Owner", "Status", "Stakeholders"]);
  });
  it("renders the saved column order and safely skips retired fields", () => {
    const options = [{ key: "Owner" }, { key: "Status" }, { key: "archived:History", archived: true }];
    expect(orderedColumns(options, ["archived:History", "Status", "Removed", "Owner", "Status"]).map((o) => o.key))
      .toEqual(["archived:History", "Status", "Owner"]);
  });
  it("does not alter order for cancelled or unknown drag targets", () => {
    expect(moveColumn(["Owner", "Status"], "Unknown", "Owner")).toEqual(["Owner", "Status"]);
    expect(moveColumn(["Owner", "Status"], "Owner", "Owner")).toEqual(["Owner", "Status"]);
  });
});