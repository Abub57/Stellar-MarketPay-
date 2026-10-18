"use strict";

jest.mock("../middleware/auth", () => ({
  verifyJWT: (req, res, next) => {
    req.user = { publicKey: req.get("x-test-public-key") };
    next();
  },
}));

jest.mock("../services/proposalTemplateService", () => ({
  listTemplates: jest.fn(),
  createTemplate: jest.fn(),
  updateTemplate: jest.fn(),
  deleteTemplate: jest.fn(),
}));

const express = require("express");
const request = require("supertest");
const service = require("../services/proposalTemplateService");
const router = require("./proposalTemplates");

const owner = `G${"A".repeat(55)}`;
const template = {
  id: "template-1",
  freelancerAddress: owner,
  name: "Frontend proposal",
  content: "I can deliver the requested work.",
};

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/proposal-templates", router);
  app.use((error, req, res, next) => {
    res.status(error.status || 500).json({ error: error.message });
  });
  return app;
}

describe("proposalTemplates router", () => {
  const app = createApp();

  beforeEach(() => jest.clearAllMocks());

  it("lists templates for the authenticated freelancer", async () => {
    service.listTemplates.mockResolvedValue([template]);

    const response = await request(app)
      .get("/api/proposal-templates")
      .set("x-test-public-key", owner);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: [template] });
    expect(service.listTemplates).toHaveBeenCalledWith(owner);
  });

  it("creates a template using the authenticated owner rather than request data", async () => {
    service.createTemplate.mockResolvedValue(template);

    const response = await request(app)
      .post("/api/proposal-templates")
      .set("x-test-public-key", owner)
      .send({ freelancerAddress: "attacker", name: template.name, content: template.content });

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual(template);
    expect(service.createTemplate).toHaveBeenCalledWith({
      freelancerAddress: owner,
      name: template.name,
      content: template.content,
    });
  });

  it("updates and deletes through the owner-scoped service methods", async () => {
    service.updateTemplate.mockResolvedValue({ ...template, content: "Updated content" });
    service.deleteTemplate.mockResolvedValue(undefined);

    const updateResponse = await request(app)
      .patch("/api/proposal-templates/template-1")
      .set("x-test-public-key", owner)
      .send({ content: "Updated content" });
    const deleteResponse = await request(app)
      .delete("/api/proposal-templates/template-1")
      .set("x-test-public-key", owner);

    expect(updateResponse.status).toBe(200);
    expect(service.updateTemplate).toHaveBeenCalledWith({
      id: "template-1",
      freelancerAddress: owner,
      name: undefined,
      content: "Updated content",
    });
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toEqual({ success: true });
    expect(service.deleteTemplate).toHaveBeenCalledWith("template-1", owner);
  });

  it("forwards service ownership errors to the API error handler", async () => {
    service.updateTemplate.mockRejectedValue(Object.assign(new Error("Template not found"), { status: 404 }));

    const response = await request(app)
      .patch("/api/proposal-templates/template-1")
      .set("x-test-public-key", owner)
      .send({ content: "Changed" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Template not found" });
  });
});
