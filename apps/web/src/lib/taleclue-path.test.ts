import assert from "node:assert/strict";
import { test } from "node:test";
import {
  taleclueBoardCell,
  taleclueMovePath,
  taleclueMovePosition,
  taleclueStackOffset,
} from "./taleclue";

test("every board position has a unique cell inside the serpentine at both widths", () => {
  for (const columns of [6, 10]) {
    for (let target = 10; target <= 50; target++) {
      const cells = Array.from({ length: target + 1 }, (_, position) =>
        taleclueBoardCell(position, target, columns),
      );
      assert.equal(new Set(cells.map(({ row, column }) => `${row}:${column}`)).size, target + 1);
      for (const cell of cells) {
        assert.ok(cell.x > 0 && cell.x < 100);
        assert.equal(cell.y, cell.row * (columns === 10 ? 104 : 80));
        assert.ok(cell.column >= 0 && cell.column < columns);
      }
      for (let position = 1; position <= target; position++) {
        const a = cells[position - 1];
        const b = cells[position];
        assert.equal(Math.abs(a.row - b.row) + Math.abs(a.column - b.column), 1);
      }
    }
  }
  assert.deepEqual(taleclueBoardCell(6, 30, 6), { row: 1, column: 5, x: (100 * 5.5) / 6, y: 80 });
  assert.equal(taleclueBoardCell(53, 50).column, taleclueBoardCell(50, 50).column);
});
test("up to eight pawns share a cell without overlapping or overflowing a mobile cell", () => {
  for (let count = 1; count <= 8; count++) {
    const offsets = Array.from({ length: count }, (_, index) => taleclueStackOffset(index, count));
    for (const offset of offsets) {
      assert.ok(Math.abs(offset.x) + 8 <= 27);
      assert.ok(offset.y >= 0 && offset.y + 16 <= 52);
    }
    for (let i = 0; i < count; i++)
      for (let j = i + 1; j < count; j++) {
        assert.ok(
          Math.abs(offsets[i].x - offsets[j].x) >= 16 ||
            Math.abs(offsets[i].y - offsets[j].y) >= 16,
        );
      }
  }
});
test("board motion visits each server-projected house, including turns and the final house", () => {
  assert.deepEqual(taleclueMovePath(3, 8), [3, 4, 5, 6, 7, 8]);
  assert.deepEqual(taleclueMovePath(48, 50), [48, 49, 50]);
  assert.deepEqual(taleclueMovePath(10, 10), [10]);
  assert.deepEqual(taleclueMovePath(5, 3), [5, 4, 3]);
});
test("reconnecting during board movement seeks the current house and finishes at twelve seconds", () => {
  assert.equal(taleclueMovePosition(2, 6, 9500), 2);
  assert.equal(taleclueMovePosition(2, 6, 10200), 3);
  assert.equal(taleclueMovePosition(2, 6, 10800), 4);
  assert.equal(taleclueMovePosition(2, 6, 11400), 5);
  assert.equal(taleclueMovePosition(2, 6, 12000), 6);
  assert.equal(taleclueMovePosition(48, 50, 15000), 50);
});
