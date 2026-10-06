import { assertEquals } from "jsr:@std/assert@1";
import { mergeScores, parseScores, reasonFor, scoresToDecision } from "./moderation.ts";

Deno.test("low scores are clean", () => {
  assertEquals(scoresToDecision({ sexual: 0.1, violence: 0.2 }), { decision: "clean", labels: [] });
});

Deno.test("a score between flag and block is a flag", () => {
  assertEquals(scoresToDecision({ harassment: 0.75 }), { decision: "flag", labels: ["harassment"] });
});

Deno.test("the worst category wins", () => {
  assertEquals(scoresToDecision({ harassment: 0.75, sexual: 0.6 }), {
    decision: "block",
    labels: ["harassment", "sexual"],
  });
});

Deno.test("an unknown category uses the cautious default", () => {
  assertEquals(scoresToDecision({ newthing: 0.85 }).decision, "flag");
  assertEquals(scoresToDecision({ newthing: 0.5 }).decision, "clean");
});

Deno.test("scores from a caption and photos merge to the highest", () => {
  assertEquals(mergeScores([{ sexual: 0.2, hate: 0.7 }, { sexual: 0.6 }]), { sexual: 0.6, hate: 0.7 });
});

Deno.test("parseScores reads category_scores and survives junk", () => {
  assertEquals(parseScores({ results: [{ category_scores: { sexual: 0.4, x: "no" } }] }), { sexual: 0.4 });
  assertEquals(parseScores(null), {});
  assertEquals(parseScores({ results: [] }), {});
});

Deno.test("the report reason follows the highest label", () => {
  assertEquals(reasonFor(["harassment", "sexual"], { harassment: 0.75, sexual: 0.9 }), "sexual_content");
  assertEquals(reasonFor(["sexual/minors"], { "sexual/minors": 0.4 }), "underage");
  assertEquals(reasonFor(["illicit"], { illicit: 0.8 }), "other");
  assertEquals(reasonFor([], {}), "other");
});
