// Fixed, previously acknowledged closed preparation. Never inferred from mutable online settings.
export default {
    "id": "w49n41-w48n41-first-delivery-v1",
    "baseRoom": "W49N41",
    "targetRoom": "W48N41",
    "remoteId": "W49N41:W48N41",
    "sourceId": "5bbcaa6d9099fc012e63155b",
    "receiverId": "6ad0b55bceeb3db0d3b4dda0",
    "containerPos": {
        "x": 19,
        "y": 6,
        "roomName": "W48N41"
    },
    "oldCurrent": {
        "identity": {
            "trialId": "econ-w48-20261021-01",
            "sequence": 1,
            "remoteId": "W49N41:W48N41",
            "epoch": 2,
            "codeVersion": "1792555927985"
        },
        "managed": true,
        "status": "terminal",
        "baseRoom": "W49N41",
        "targetRoom": "W48N41",
        "configFingerprint": "{\"baseRoom\":\"W49N41\",\"targetRoom\":\"W48N41\",\"sourceId\":\"5bbcaa6d9099fc012e63155b\",\"containerId\":null,\"containerPos\":{\"x\":19,\"y\":6,\"roomName\":\"W48N41\"},\"receiverIds\":[\"6ad0b55bceeb3db0d3b4dda0\"],\"allowContainerBuild\":true,\"reserveController\":false,\"roleLimits\":{\"scout\":1,\"remoteMiner\":1,\"remoteHauler\":1,\"reserver\":0},\"bodyEnergyLimits\":{\"scout\":50,\"remoteMiner\":800,\"remoteHauler\":800,\"reserver\":650},\"spawnEnergyLimit\":2000,\"infrastructureEnergyLimit\":6000,\"windowTicks\":1000,\"safeStreakTicks\":100,\"maxLegTicks\":300,\"reconCooldownTicks\":200}",
        "startedAtTick": 83794429,
        "receiverId": "6ad0b55bceeb3db0d3b4dda0",
        "sourceId": "5bbcaa6d9099fc012e63155b",
        "containerPos": {
            "x": 19,
            "y": 6,
            "roomName": "W48N41"
        },
        "expiresAtTick": 83795429,
        "issuedAtMs": 1792630306177,
        "expiresAtMs": 1792635706177,
        "lastTick": 83794451,
        "lastNowMs": 1792630408331,
        "safeStreak": 0,
        "slots": {
            "scout": {
                "calls": 1,
                "requestId": "remote:W49N41:W48N41:2:7",
                "deadline": 83794434,
                "name": "scout_83794429_Spawn1_0",
                "body": [
                    "move"
                ],
                "bodyCost": 50,
                "callState": "result_known",
                "intakeTick": 83794429,
                "callTick": 83794429,
                "ledgerStage": "applied",
                "nativeResult": 0,
                "engineAcceptedAt": 83794429,
                "ledgerApplication": {
                    "applied": true,
                    "cost": 50
                },
                "acceptedAt": 83794429,
                "cost": 50,
                "receiptBinding": {
                    "identity": {
                        "trialId": "econ-w48-20261021-01",
                        "sequence": 1,
                        "remoteId": "W49N41:W48N41",
                        "epoch": 2,
                        "codeVersion": "1792555927985"
                    },
                    "requestId": "remote:W49N41:W48N41:2:7",
                    "name": "scout_83794429_Spawn1_0",
                    "tick": 83794429
                },
                "result": 0
            },
            "remoteMiner": {
                "calls": 0
            },
            "remoteHauler": {
                "calls": 0
            }
        },
        "events": [
            {
                "tick": 83794429,
                "status": "recon",
                "reason": "started"
            },
            {
                "tick": 83794452,
                "status": "stopping",
                "reason": "vision_lost"
            }
        ],
        "outbox": [],
        "evidence": {
            "confirmedSpawnCost": 50,
            "confirmedInfrastructureCost": 0,
            "unknownEnergyUpperBound": 0,
            "unknownEvents": 0,
            "pickups": {},
            "delivered": {},
            "returnedEnergy": 0
        },
        "scopeCheckedAt": 83794451,
        "visionAcquired": true,
        "outcome": {
            "verdict": "aborted",
            "stopReason": "vision_lost",
            "decidedAtTick": 83794452
        },
        "closeAppliedAtTick": 83794452,
        "tailExpiresAtTick": 83794752,
        "closureVerifiedAtTick": 83794453
    },
    "oldPreparation": {
        "schemaVersion": 1,
        "action": "release",
        "id": "release-econ-w48-20261022-01",
        "targetTrialId": "econ-w48-20261021-01",
        "sequence": 2,
        "remoteId": "W49N41:W48N41",
        "epoch": 2,
        "codeVersion": "1792636618804",
        "configFingerprint": ""
    },
    "oldLastSequence": 1,
    "oldReconIdentity": {
        "trialId": "w48-20261021-01",
        "sequence": 5,
        "remoteId": "W49N41:W48N41",
        "epoch": 1,
        "codeVersion": "1792555927985"
    },
    "oldReconLastSequence": 6,
    "oldReconRequest": {
        "schemaVersion": 1,
        "action": "release",
        "id": "econ-release-6",
        "targetTrialId": "w48-20261021-01",
        "sequence": 6,
        "remoteId": "W49N41:W48N41",
        "epoch": 1,
        "codeVersion": "1792555927985",
        "activateAtTick": 83781309,
        "expiresAtTick": 83781609,
        "issuedAtMs": 1792571575599,
        "expiresAtMs": 1792572775599
    },
    "originalWindow": {
        "stopAtMs": 1792665000841,
        "notAfterMs": 1792665120841
    },
    "oldReconCurrent": {
        "identity": {
            "trialId": "w48-20261021-01",
            "sequence": 5,
            "remoteId": "W49N41:W48N41",
            "epoch": 1,
            "codeVersion": "1792555927985"
        },
        "candidateSourceId": "5bbcaa6d9099fc012e63155b",
        "startedAtTick": 83778588,
        "expiresAtTick": 83778888,
        "issuedAtMs": 1792559662829,
        "expiresAtMs": 1792560862829,
        "configFingerprint": "{\"baseRoom\":\"W49N41\",\"targetRoom\":\"W48N41\",\"sourceId\":null,\"containerId\":null,\"containerPos\":{\"x\":19,\"y\":6,\"roomName\":\"W48N41\"},\"receivers\":[\"6ad0b55bceeb3db0d3b4dda0\"],\"allowContainerBuild\":false,\"reserveController\":false,\"candidateSourceId\":\"5bbcaa6d9099fc012e63155b\",\"limits\":{\"scout\":1,\"remoteMiner\":0,\"remoteHauler\":0,\"reserver\":0},\"spawnEnergyLimit\":2000,\"infrastructureEnergyLimit\":6000,\"windowTicks\":1000,\"maxLegTicks\":300,\"safeStreakTicks\":100,\"reconCooldownTicks\":200,\"bodyEnergyLimits\":{\"scout\":50,\"remoteMiner\":800,\"remoteHauler\":800,\"reserver\":650}}",
        "baseRoom": "W49N41",
        "targetRoom": "W48N41",
        "status": "completed",
        "managed": false,
        "lastTick": 83778708,
        "lastNowMs": 1792560193624,
        "spawn": {
            "requestId": "remote:W49N41:W48N41:1:6",
            "deadline": 83778593,
            "name": "scout_83778588_Spawn1_0",
            "spawnName": "Spawn1",
            "callState": "result_known",
            "callTick": 83778588,
            "acceptedAt": 83778588,
            "result": 0
        },
        "evidence": {
            "safeStreak": 100,
            "onlineRecoveryCovered": false,
            "spawnEnergyBaseline": 250,
            "spawnAcceptedTick": 83778588,
            "spawningObservedTick": 83778589,
            "bornAt": 83778591,
            "birthPosition": {
                "x": 31,
                "y": 23,
                "roomName": "W49N41"
            },
            "lastPosition": {
                "x": 1,
                "y": 25,
                "roomName": "W48N41"
            },
            "lastPositionTick": 83778708,
            "firstMovementAt": 83778592,
            "legStartedAt": 83778591,
            "legExpiresAt": 83778651,
            "maxRetryCount": 0,
            "enteredRemoteAt": 83778609,
            "lastSafeTick": 83778708,
            "routeCheckedAt": 83778708,
            "route": {
                "valid": true,
                "reasons": [],
                "outboundTicks": 36,
                "inboundTicks": 36,
                "roles": {
                    "remoteMiner": {
                        "outboundTicks": 37,
                        "inboundTicks": 36
                    },
                    "remoteHauler": {
                        "outboundTicks": 36,
                        "inboundTicks": 36
                    }
                },
                "receiverId": "6ad0b55bceeb3db0d3b4dda0",
                "checkedAt": 83778708
            }
        },
        "events": [
            {
                "tick": 83778588,
                "status": "waiting_spawn",
                "reason": "started"
            },
            {
                "tick": 83778708,
                "status": "stopping",
                "reason": "recon_complete"
            }
        ],
        "settlement": {
            "confirmedCost": 50,
            "unknownUpperBound": 0,
            "updatedAtTick": 83778588
        },
        "settlementBinding": {
            "schemaVersion": 1,
            "identity": {
                "trialId": "w48-20261021-01",
                "sequence": 5,
                "remoteId": "W49N41:W48N41",
                "epoch": 1,
                "codeVersion": "1792555927985"
            },
            "requestId": "remote:W49N41:W48N41:1:6",
            "name": "scout_83778588_Spawn1_0",
            "confirmedReceiptTick": 83778588
        },
        "settlementSourceStatus": "scoped",
        "scopeCheckedAt": 83778708,
        "scopeAllowsOutbound": false,
        "outcome": {
            "verdict": "completed",
            "stopReason": "recon_complete",
            "decidedAtTick": 83778708,
            "evidence": {
                "safeStreak": 100,
                "onlineRecoveryCovered": false,
                "spawnEnergyBaseline": 250,
                "spawnAcceptedTick": 83778588,
                "spawningObservedTick": 83778589,
                "bornAt": 83778591,
                "birthPosition": {
                    "x": 31,
                    "y": 23,
                    "roomName": "W49N41"
                },
                "lastPosition": {
                    "x": 1,
                    "y": 25,
                    "roomName": "W48N41"
                },
                "lastPositionTick": 83778708,
                "firstMovementAt": 83778592,
                "legStartedAt": 83778591,
                "legExpiresAt": 83778651,
                "maxRetryCount": 0,
                "enteredRemoteAt": 83778609,
                "lastSafeTick": 83778708,
                "routeCheckedAt": 83778708,
                "route": {
                    "valid": true,
                    "reasons": [],
                    "outboundTicks": 36,
                    "inboundTicks": 36,
                    "roles": {
                        "remoteMiner": {
                            "outboundTicks": 37,
                            "inboundTicks": 36
                        },
                        "remoteHauler": {
                            "outboundTicks": 36,
                            "inboundTicks": 36
                        }
                    },
                    "receiverId": "6ad0b55bceeb3db0d3b4dda0",
                    "checkedAt": 83778708
                }
            }
        },
        "closeAppliedAtTick": 83778708,
        "closureVerifiedAtTick": 83778709
    }
};
