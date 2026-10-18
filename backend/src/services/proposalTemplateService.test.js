"use strict";

jest.mock("../db/pool", () => ({ query: jest.fn() }));

const pool = require("../db/pool");
const {
  MAX_TEMPLATES_PER_FREELANCER,
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} = require("./proposalTemplateService");

const owner = `G${"A".repeat(55)}`;
const otherOwner = `G${"B".repeat(55)}`;

function templateRow(overrides = {}) {
  return {
    id: "template-1",
    freelancer_address: owner,
    name: "Frontend proposal",
    content: "I can deliver {{scope}} in {{timeline}}.",
    created_at: new Date("2026-01-01T00:00:00Z"),
    updated_at: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

describe("proposalTemplateService", () => {
  beforeEach(() => pool.query.mockReset());

  describe("listTemplates", () => {
    it("returns mapped templates scoped to the requesting freelancer", async () => {
      pool.query.mockResolvedValue({ rows: [templateRow()] });

      await expect(listTemplates(owner)).resolves.toEqual([
        {
          id: "template-1",
          freelancerAddress: owner,
          name: "Frontend proposal",
          content: "I can deliver {{scope}} in {{timeline}}.",
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        },
      ]);
      expect(pool.query.mock.calls[0][0]).toContain("WHERE freelancer_address = $1");
      expect(pool.query.mock.calls[0][1]).toEqual([owner]);
    });

    it("rejects an invalid freelancer address before querying", async () => {
      await expect(listTemplates("not-a-stellar-key")).rejects.toMatchObject({
        message: "Invalid Stellar public key",
        status: 400,
      });
      expect(pool.query).not.toHaveBeenCalled();
    });
  });

  describe("createTemplate", () => {
    it("trims inputs and creates a template for its owner", async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [templateRow({ name: "Proposal", content: "Reusable text" })] });

      const result = await createTemplate({
        freelancerAddress: owner,
        name: " Proposal ",
        content: " Reusable text ",
      });

      expect(result.name).toBe("Proposal");
      expect(result.content).toBe("Reusable text");
      expect(pool.query.mock.calls[0][1]).toEqual([owner]);
      expect(pool.query.mock.calls[1][0]).toContain("INSERT INTO proposal_templates");
      expect(pool.query.mock.calls[1][1]).toEqual([owner, "Proposal", "Reusable text"]);
    });

    it("rejects blank fields without touching the database", async () => {
      await expect(createTemplate({ freelancerAddress: owner, name: "  ", content: "body" })).rejects.toMatchObject({
        message: "Template name and content are required",
        status: 400,
      });
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("enforces the per-freelancer template limit", async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ count: MAX_TEMPLATES_PER_FREELANCER }] });

      await expect(createTemplate({ freelancerAddress: owner, name: "Proposal", content: "Text" })).rejects.toMatchObject({
        message: "Maximum 10 templates allowed per freelancer",
        status: 400,
      });
      expect(pool.query).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateTemplate", () => {
    it("updates only the fields supplied and includes the owner in the update", async () => {
      pool.query.mockResolvedValueOnce({ rows: [templateRow({ name: "Updated proposal" })] });

      const result = await updateTemplate({ id: "template-1", freelancerAddress: owner, name: "Updated proposal" });

      expect(result.name).toBe("Updated proposal");
      expect(pool.query.mock.calls[0][0]).toContain("WHERE id = $1 AND freelancer_address = $2");
      expect(pool.query.mock.calls[0][1]).toEqual(["template-1", owner, "Updated proposal"]);
    });

    it("rejects an empty update", async () => {
      await expect(updateTemplate({ id: "template-1", freelancerAddress: owner })).rejects.toMatchObject({
        message: "At least one field is required to update template",
        status: 400,
      });
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("does not update a template owned by another freelancer", async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      await expect(updateTemplate({ id: "template-1", freelancerAddress: otherOwner, content: "Changed" })).rejects.toMatchObject({
        message: "Template not found",
        status: 404,
      });
      expect(pool.query.mock.calls[0][1]).toEqual(["template-1", otherOwner, "Changed"]);
    });
  });

  describe("deleteTemplate", () => {
    it("deletes only the matching owner's template", async () => {
      pool.query.mockResolvedValueOnce({ rowCount: 1 });

      await expect(deleteTemplate("template-1", owner)).resolves.toBeUndefined();
      expect(pool.query.mock.calls[0][0]).toContain("WHERE id = $1 AND freelancer_address = $2");
      expect(pool.query.mock.calls[0][1]).toEqual(["template-1", owner]);
    });

    it("reports not found when the owner does not match", async () => {
      pool.query.mockResolvedValueOnce({ rowCount: 0 });

      await expect(deleteTemplate("template-1", otherOwner)).rejects.toMatchObject({
        message: "Template not found",
        status: 404,
      });
      expect(pool.query.mock.calls[0][1]).toEqual(["template-1", otherOwner]);
    });
  });
});
