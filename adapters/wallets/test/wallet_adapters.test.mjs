import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  buildCreateTypedData,
  resolveCreate,
} from "../privy/resolve_create.mjs";
import {
  resolveCreate as resolveBaseMcpCreate,
} from "../base-mcp/resolve_create.mjs";
import {
  buildSendCallsRequest,
  normalizePreparedTransactions,
  resolveFunding,
} from "../base-mcp/resolve_funding.mjs";
import {
  resolveCreate as resolveBankrCreate,
} from "../bankr/resolve_create.mjs";
import {
  resolveFunding as resolveBankrFunding,
} from "../bankr/resolve_funding.mjs";

const walletAdaptersRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(walletAdaptersRoot));

test("wallet adapter contract documents create and funding outputs", async () => {
  const contract = await readFile(join(walletAdaptersRoot, "contract.md"), "utf8");

  assert.ok(contract.includes('"next_action": "run_skill_step"'));
  assert.ok(contract.includes('"next_action": "fund_market"'));
  assert.ok(contract.includes("wallet_audit"));
  assert.ok(contract.includes("Adapters must not print secrets"));
  assert.ok(!contract.includes("Funding adapters are not implemented yet"));
});

test("Privy create resolver selects wallet, fetches nonce, and signs Privy typed data", async () => {
  const requests = [];
  const intent = buildCreateIntentFixture();
  const fetch = async (url, options = {}) => {
    requests.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    if (String(url).includes("/wallets?")) {
      return jsonResponse({
        data: [
          {
            id: "wallet_a",
            address: "0x1111111111111111111111111111111111111111",
            chain_type: "ethereum",
            policy_ids: ["policy_a"],
          },
          {
            id: "wallet_b",
            address: "0x2222222222222222222222222222222222222222",
            chain_type: "ethereum",
            policy_ids: ["policy_b"],
          },
        ],
      });
    }
    if (String(url).includes("/policies/policy_a")) {
      return jsonResponse({
        id: "policy_a",
        rules: [
          { method: "eth_signTypedData_v4", action: "ALLOW" },
          { method: "eth_sendTransaction", action: "ALLOW" },
        ],
      });
    }
    if (String(url).includes("/policies/policy_b")) {
      return jsonResponse({
        id: "policy_b",
        rules: [
          { method: "eth_signTypedData_v4", action: "ALLOW" },
          { method: "eth_sendTransaction", action: "ALLOW" },
        ],
      });
    }
    if (String(url) === "https://rpc.example") {
      return jsonResponse({ jsonrpc: "2.0", id: 1, result: "0x7" });
    }
    if (String(url).endsWith("/wallets/wallet_b/rpc")) {
      assert.equal(requests.at(-1).body.method, "eth_signTypedData_v4");
      assert.equal(requests.at(-1).body.caip2, undefined);
      assert.equal(requests.at(-1).body.params.typed_data.primaryType, undefined);
      assert.equal(requests.at(-1).body.params.typed_data.primary_type, "PrecogMarketAuthorization");
      assert.equal(requests.at(-1).body.params.typed_data.message.account, "0x2222222222222222222222222222222222222222");
      assert.equal(requests.at(-1).body.params.typed_data.message.nonce, 7);
      return jsonResponse({ method: "eth_signTypedData_v4", data: { signature: "0xSignature" } });
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  const resolved = await resolveCreate({
    intent,
    walletId: "wallet_b",
    rpcUrl: "https://rpc.example",
    env: { PRIVY_APP_ID: "app", PRIVY_APP_SECRET: "secret" },
    fetch,
  });

  assert.equal(resolved.event.creator_address, "0x2222222222222222222222222222222222222222");
  assert.equal(resolved.event.creator_signature, "0xSignature");
  assert.equal(resolved.event.image_url, "https://example.com/image.png");
  assert.equal(resolved.event.wallet_audit.provider, "privy");
  assert.equal(resolved.event.wallet_audit.nonce, 7);
  assert.equal(resolved.next_action, "run_skill_step");
  assert.ok(requests.some((request) => String(request.url).includes("/wallets?chain_type=ethereum")));
});

test("Privy create resolver refuses ambiguous typed-data-capable wallets", async () => {
  const fetch = async (url) => {
    if (String(url).includes("/wallets?")) {
      return jsonResponse({
        data: [
          {
            id: "wallet_a",
            address: "0x1111111111111111111111111111111111111111",
            chain_type: "ethereum",
            policy_ids: ["policy_a"],
          },
          {
            id: "wallet_b",
            address: "0x2222222222222222222222222222222222222222",
            chain_type: "ethereum",
            policy_ids: ["policy_b"],
          },
        ],
      });
    }
    if (String(url).includes("/policies/")) {
      return jsonResponse({
        rules: [
          { method: "eth_signTypedData_v4", action: "ALLOW" },
          { method: "eth_sendTransaction", action: "ALLOW" },
        ],
      });
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  await assert.rejects(
    resolveCreate({
      intent: buildCreateIntentFixture(),
      env: { PRIVY_APP_ID: "app", PRIVY_APP_SECRET: "secret" },
      fetch,
    }),
    (error) => {
      assert.equal(error.code, "PRIVY_WALLET_SELECTION_REQUIRED");
      assert.equal(error.wallets.length, 2);
      assert.equal(error.wallets[0].wallet_id, "wallet_a");
      assert.ok(!JSON.stringify(error).includes("secret"));
      return true;
    },
  );
});

test("Privy create resolver ignores DENY typed-data policy rules", async () => {
  const fetch = async (url) => {
    if (String(url).includes("/wallets?")) {
      return jsonResponse({
        data: [
          {
            id: "wallet_denied",
            address: "0x1111111111111111111111111111111111111111",
            chain_type: "ethereum",
            policy_ids: ["policy_denied"],
          },
        ],
      });
    }
    if (String(url).includes("/policies/policy_denied")) {
      return jsonResponse({
        id: "policy_denied",
        rules: [{ method: "eth_signTypedData_v4", action: "DENY" }],
      });
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  await assert.rejects(
    resolveCreate({
      intent: buildCreateIntentFixture(),
      walletId: "wallet_denied",
      env: { PRIVY_APP_ID: "app", PRIVY_APP_SECRET: "secret" },
      fetch,
    }),
    /ALLOW eth_signTypedData_v4 and eth_sendTransaction/,
  );
});

test("Privy create resolver surfaces sanitized API authorization failures", async () => {
  const fetch = async (url) => {
    if (String(url).includes("/wallets?")) {
      return jsonResponse({ error: "Forbidden", message: "Invalid credentials" }, 403);
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  await assert.rejects(
    resolveCreate({
      intent: buildCreateIntentFixture(),
      env: { PRIVY_APP_ID: "app", PRIVY_APP_SECRET: "secret" },
      fetch,
    }),
    (error) => {
      assert.equal(error.code, "PRIVY_API_REQUEST_FAILED");
      assert.equal(error.status, 403);
      assert.ok(error.endpoint.includes("/wallets?chain_type=ethereum"));
      assert.ok(error.body.includes("Forbidden"));
      assert.ok(!JSON.stringify(error).includes("secret"));
      return true;
    },
  );
});

test("Privy create resolver reports wallet policy diagnostics when no wallet matches", async () => {
  const fetch = async (url) => {
    if (String(url).includes("/wallets?")) {
      return jsonResponse({
        data: [
          {
            id: "wallet_sign_only",
            address: "0x1111111111111111111111111111111111111111",
            chain_type: "ethereum",
            policy_ids: ["policy_sign_only", "policy_missing"],
          },
        ],
      });
    }
    if (String(url).includes("/policies/policy_sign_only")) {
      return jsonResponse({
        id: "policy_sign_only",
        rules: [{ method: "eth_signTypedData_v4", action: "ALLOW" }],
      });
    }
    if (String(url).includes("/policies/policy_missing")) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  await assert.rejects(
    resolveCreate({
      intent: buildCreateIntentFixture(),
      walletId: "wallet_sign_only",
      env: { PRIVY_APP_ID: "app", PRIVY_APP_SECRET: "secret" },
      fetch,
    }),
    (error) => {
      assert.equal(error.code, "PRIVY_WALLET_SELECTION_REQUIRED");
      assert.equal(error.wallet_diagnostics.total_wallets, 1);
      assert.deepEqual(error.wallet_diagnostics.checked_wallets[0].allow_methods, ["eth_signTypedData_v4"]);
      assert.equal(error.wallet_diagnostics.policy_read_failures[0].policy_id, "policy_missing");
      assert.equal(error.wallet_diagnostics.policy_read_failures[0].status, 403);
      assert.ok(!JSON.stringify(error).includes("secret"));
      return true;
    },
  );
});

test("Privy create resolver requires transaction-send policy for future funding", async () => {
  const fetch = async (url) => {
    if (String(url).includes("/wallets?")) {
      return jsonResponse({
        data: [
          {
            id: "wallet_sign_only",
            address: "0x1111111111111111111111111111111111111111",
            chain_type: "ethereum",
            policy_ids: ["policy_sign_only"],
          },
        ],
      });
    }
    if (String(url).includes("/policies/policy_sign_only")) {
      return jsonResponse({
        id: "policy_sign_only",
        rules: [{ method: "eth_signTypedData_v4", action: "ALLOW" }],
      });
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  await assert.rejects(
    resolveCreate({
      intent: buildCreateIntentFixture(),
      walletId: "wallet_sign_only",
      env: { PRIVY_APP_ID: "app", PRIVY_APP_SECRET: "secret" },
      fetch,
    }),
    /eth_sendTransaction/,
  );
});

test("Privy typed-data conversion keeps canonical intent immutable", () => {
  const template = buildCreateIntentFixture().eip712_typed_data_template;
  const typedData = buildCreateTypedData(template, "0xCreator", 12);

  assert.equal(template.primaryType, "PrecogMarketAuthorization");
  assert.equal(template.primary_type, undefined);
  assert.equal(typedData.primaryType, undefined);
  assert.equal(typedData.primary_type, "PrecogMarketAuthorization");
  assert.equal(typedData.message.account, "0xCreator");
  assert.equal(typedData.message.nonce, 12);
});

test("portable skill points to wallet adapters without embedding provider implementation", async () => {
  const skill = await readFile(join(repoRoot, "skill", "forecast-os", "SKILL.md"), "utf8");
  const shim = await readFile(
    join(repoRoot, "skill", "forecast-os", "scripts", "wallets", "privy_resolve_create.mjs"),
    "utf8",
  );

  assert.ok(skill.includes("adapters/wallets/<provider>"));
  assert.ok(skill.includes("references/wallet-adapters.md"));
  assert.ok(shim.includes("adapters/wallets/privy/resolve_create.mjs"));
  assert.ok(!shim.includes("PRIVY_API_ROOT"));
});

test("Base MCP funding resolver maps a single calldata envelope to send_calls", () => {
  const transactions = normalizePreparedTransactions({
    ok: true,
    data: {
      to: "0x3333333333333333333333333333333333333333",
      data: "0xabcdef",
      chainId: 8453,
    },
  });

  assert.deepEqual(buildSendCallsRequest(transactions), {
    chain: "base",
    calls: [
      {
        to: "0x3333333333333333333333333333333333333333",
        value: "0x0",
        data: "0xabcdef",
      },
    ],
  });
});

test("Base MCP create resolver refuses smart-account signatures before Precog submission", () => {
  const resolved = resolveBaseMcpCreate({
    intent: buildCreateIntentFixture(),
    walletAddress: "0x2222222222222222222222222222222222222222",
    nonce: "9",
  });

  assert.equal(resolved.status, "base_mcp_signature_required");
  assert.equal(resolved.base_mcp.sign.type, "typed_data");
  assert.equal(resolved.base_mcp.sign.data.message.account, "0x2222222222222222222222222222222222222222");
  assert.equal(resolved.base_mcp.sign.data.message.nonce, 9);

  assert.throws(
    () =>
      resolveBaseMcpCreate({
        intent: buildCreateIntentFixture(),
        walletAddress: "0x2222222222222222222222222222222222222222",
        nonce: "9",
        creatorSignature: "0x" + "ab".repeat(96),
      }),
    /smart-account\/WebAuthn signature/,
  );
});

test("Base MCP create resolver returns run_skill_step output for EOA signatures", () => {
  const resolved = resolveBaseMcpCreate({
    intent: buildCreateIntentFixture(),
    walletAddress: "0x2222222222222222222222222222222222222222",
    nonce: "0x9",
    creatorSignature: "0x" + "ab".repeat(65),
  });

  assert.equal(resolved.next_action, "run_skill_step");
  assert.equal(resolved.event.creator_address, "0x2222222222222222222222222222222222222222");
  assert.equal(resolved.event.creator_signature, "0x" + "ab".repeat(65));
  assert.equal(resolved.event.wallet_audit.provider, "base-mcp");
  assert.equal(resolved.event.wallet_audit.nonce, 9);
});

test("Base MCP funding resolver returns required wallet actions before tx hash", () => {
  const resolved = resolveFunding({
    intent: buildFundingIntentFixture(),
    walletAddress: "0x2222222222222222222222222222222222222222",
    walletId: "base_wallet",
    nonce: "9",
    prepareResponse: {
      transactions: [
        {
          step: "approve",
          to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          value: "0",
          data: "0x095ea7b3",
          chainId: "0x2105",
        },
        {
          step: "fund",
          to: "0x4444444444444444444444444444444444444444",
          value: "0x0",
          data: "0xfeedface",
          chainId: 8453,
        },
      ],
    },
  });

  assert.equal(resolved.status, "base_mcp_actions_required");
  assert.equal(resolved.base_mcp.send_calls.chain, "base");
  assert.equal(resolved.base_mcp.send_calls.calls.length, 2);
  assert.equal(resolved.base_mcp.sign.typed_data.message.account, "0x2222222222222222222222222222222222222222");
  assert.equal(resolved.base_mcp.sign.typed_data.message.nonce, 9);
  assert.equal(resolved.wallet_audit.provider, "base-mcp");
  assert.equal(resolved.next_action, "base_mcp_sign_and_send_calls");
});

test("Base MCP funding resolver accepts Base Account smart-wallet signatures", () => {
  const smartWalletSignature = "0x" + "ab".repeat(96);
  const resolved = resolveFunding({
    intent: buildFundingIntentFixture(),
    walletAddress: "0x2222222222222222222222222222222222222222",
    nonce: 10,
    funderSignature: smartWalletSignature,
    txHash: "0x1234",
    prepareResponse: {
      transactions: [
        {
          step: "fund",
          to: "0x4444444444444444444444444444444444444444",
          data: "0xfeedface",
          chain: "base",
        },
      ],
    },
  });

  assert.deepEqual(resolved.funding_request, {
    upcoming_market: 123,
    amount: "1.5",
    tx_hash: "0x1234",
    funder_address: "0x2222222222222222222222222222222222222222",
    funder_signature: smartWalletSignature,
  });
  assert.equal(resolved.wallet_audit.method, "base_mcp_sign_and_send_calls");
  assert.equal(
    resolved.wallet_audit.signature_compatibility,
    "base_account_eip1271_erc6492_supported_for_precog_funding",
  );
  assert.equal(resolved.next_action, "fund_market");
});

test("Bankr create resolver signs EIP-712 typed data and returns run_skill_step output", async () => {
  const requests = [];
  const resolved = await resolveBankrCreate({
    intent: buildCreateIntentFixture(),
    apiKey: "bk_test",
    apiRoot: "https://api.bankr.test",
    nonce: "0x7",
    fetch: async (url, options = {}) => {
      requests.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
      if (String(url).endsWith("/wallet/me")) {
        return jsonResponse({ address: "0x2222222222222222222222222222222222222222" });
      }
      if (String(url).endsWith("/wallet/sign")) {
        assert.equal(requests.at(-1).body.signatureType, "eth_signTypedData_v4");
        assert.equal(requests.at(-1).body.typedData.primaryType, "PrecogMarketAuthorization");
        assert.equal(requests.at(-1).body.typedData.message.account, "0x2222222222222222222222222222222222222222");
        assert.equal(requests.at(-1).body.typedData.message.nonce, 7);
        return jsonResponse({
          success: true,
          signature: "0x" + "ab".repeat(65),
          signer: "0x2222222222222222222222222222222222222222",
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  });

  assert.equal(resolved.next_action, "run_skill_step");
  assert.equal(resolved.event.creator_address, "0x2222222222222222222222222222222222222222");
  assert.equal(resolved.event.creator_signature, "0x" + "ab".repeat(65));
  assert.equal(resolved.event.wallet_audit.provider, "bankr");
  assert.equal(resolved.event.wallet_audit.api_endpoint, "/wallet/sign");
  assert.equal(requests[0].options.headers["X-API-Key"], "bk_test");
});

test("Bankr create resolver fails clearly for missing key and signing access errors", async () => {
  await assert.rejects(
    resolveBankrCreate({
      intent: buildCreateIntentFixture(),
      fetch: async () => {
        throw new Error("must not call network without key");
      },
      env: {},
    }),
    /Bankr API key is required/,
  );

  await assert.rejects(
    resolveBankrCreate({
      intent: buildCreateIntentFixture(),
      apiKey: "bk_read_only",
      apiRoot: "https://api.bankr.test",
      nonce: 1,
      fetch: async (url) => {
        if (String(url).endsWith("/wallet/me")) {
          return jsonResponse({ address: "0x2222222222222222222222222222222222222222" });
        }
        if (String(url).endsWith("/wallet/sign")) {
          return jsonResponse({ error: "read-only key or Wallet API write access missing" }, 403);
        }
        throw new Error(`Unexpected URL ${url}`);
      },
    }),
    /Bankr typed-data signing failed: 403.*read-only/,
  );

  await assert.rejects(
    resolveBankrCreate({
      intent: buildCreateIntentFixture(),
      apiKey: "bk_test",
      apiRoot: "https://api.bankr.test",
      nonce: 1,
      fetch: async (url) => {
        if (String(url).endsWith("/wallet/me")) {
          return jsonResponse({ address: "0x2222222222222222222222222222222222222222" });
        }
        if (String(url).endsWith("/wallet/sign")) {
          return jsonResponse({ success: true, signer: "0x2222222222222222222222222222222222222222" });
        }
        throw new Error(`Unexpected URL ${url}`);
      },
    }),
    /did not include a signature/,
  );
});

test("Bankr funding resolver signs typed data and submits prepared transactions in order", async () => {
  const requests = [];
  const resolved = await resolveBankrFunding({
    intent: buildFundingIntentFixture(),
    apiKey: "bk_test",
    apiRoot: "https://api.bankr.test",
    nonce: 8,
    prepareResponse: {
      transactions: [
        {
          step: "approve",
          to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          value: "0",
          data: "0x095ea7b3",
          chainId: 8453,
        },
        {
          step: "fund",
          to: "0x4444444444444444444444444444444444444444",
          value: "0x0",
          data: "0xfeedface",
          chain: "base",
        },
      ],
    },
    fetch: async (url, options = {}) => {
      requests.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
      if (String(url).endsWith("/wallet/me")) {
        return jsonResponse({ wallet: { id: "bankr_wallet", address: "0x2222222222222222222222222222222222222222" } });
      }
      if (String(url).endsWith("/wallet/sign")) {
        assert.equal(requests.at(-1).body.signatureType, "eth_signTypedData_v4");
        assert.equal(requests.at(-1).body.typedData.message.action, "FUND_UPCOMING_MARKET");
        return jsonResponse({
          signature: "0x" + "cd".repeat(65),
          signer: "0x2222222222222222222222222222222222222222",
        });
      }
      if (String(url).endsWith("/wallet/submit")) {
        const submitCount = requests.filter((request) => String(request.url).endsWith("/wallet/submit")).length;
        return jsonResponse({
          success: true,
          transactionHash: submitCount === 1 ? "0xaaa1" : "0xbbb2",
          signer: "0x2222222222222222222222222222222222222222",
          chainId: 8453,
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  });

  assert.deepEqual(resolved.funding_request, {
    upcoming_market: 123,
    amount: "1.5",
    tx_hash: "0xbbb2",
    funder_address: "0x2222222222222222222222222222222222222222",
    funder_signature: "0x" + "cd".repeat(65),
  });
  assert.equal(resolved.wallet_audit.provider, "bankr");
  assert.equal(resolved.wallet_audit.method, "bankr_wallet_sign_and_submit");
  assert.deepEqual(resolved.wallet_audit.transaction_hashes, ["0xaaa1", "0xbbb2"]);
  const submitBodies = requests.filter((request) => String(request.url).endsWith("/wallet/submit")).map((request) => request.body);
  assert.equal(submitBodies.length, 2);
  assert.equal(submitBodies[0].transaction.to, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  assert.equal(submitBodies[1].transaction.to, "0x4444444444444444444444444444444444444444");
  assert.equal(submitBodies[1].transaction.value, "0");
  assert.equal(resolved.next_action, "fund_market");
});

test("Bankr funding resolver rejects missing calldata and wrong chains", async () => {
  await assert.rejects(
    resolveBankrFunding({
      intent: buildFundingIntentFixture(),
      apiKey: "bk_test",
      prepareResponse: {},
      fetch: async () => {
        throw new Error("must not call network without calldata");
      },
    }),
    /prepared unsigned calldata envelope/,
  );

  await assert.rejects(
    resolveBankrFunding({
      intent: buildFundingIntentFixture(),
      apiKey: "bk_test",
      prepareResponse: {
        transactions: [
          {
            to: "0x4444444444444444444444444444444444444444",
            data: "0xfeedface",
            chainId: 1,
          },
        ],
      },
      fetch: async () => {
        throw new Error("must not call network for wrong chain");
      },
    }),
    /Unsupported Bankr chain id 1/,
  );
});

function buildCreateIntentFixture() {
  return {
    intent_type: "forecastos.create_market",
    chain_id: 8453,
    eip712_typed_data_template: {
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        PrecogMarketAuthorization: [
          { name: "action", type: "string" },
          { name: "account", type: "address" },
          { name: "chainId", type: "uint256" },
          { name: "nonce", type: "uint256" },
        ],
      },
      primaryType: "PrecogMarketAuthorization",
      domain: {
        name: "Precog Markets",
        version: "1",
        chainId: 8453,
        verifyingContract: "0x00000000000c109080dfa976923384b97165a57a",
      },
      message: {
        action: "CREATE_UPCOMING_MARKET",
        account: "<creator_address>",
        chainId: 8453,
        nonce: "<next_pending_nonce>",
      },
    },
    precog_payload_template: {
      image_url: "https://example.com/image.png",
      category: "culture",
    },
  };
}

function buildFundingIntentFixture() {
  return {
    intent_type: "forecastos.fund_market",
    wallet_provider: "base-mcp",
    upcoming_market: 123,
    chain_id: 8453,
    amount: "1.5",
    collateral_symbol: "USDC",
    collateral_address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    eip712_typed_data_template: {
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        PrecogMarketAuthorization: [
          { name: "action", type: "string" },
          { name: "account", type: "address" },
          { name: "chainId", type: "uint256" },
          { name: "nonce", type: "uint256" },
        ],
      },
      primaryType: "PrecogMarketAuthorization",
      domain: {
        name: "Precog Markets",
        version: "1",
        chainId: 8453,
        verifyingContract: "0x00000000000c109080dfa976923384b97165a57a",
      },
      message: {
        action: "FUND_UPCOMING_MARKET",
        account: "<funder_address>",
        chainId: 8453,
        nonce: "<next_pending_nonce>",
      },
    },
  };
}

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(value);
    },
  };
}
