let HISTORY_FETCH_LIMIT = 20000;

let globals = {
    wordMatrix: {}
};

let fetchHistory = function (email, password) {
    $.post("https://fennec-history-proxy.herokuapp.com/history", {
        email: email,
        password: password,
        limit: HISTORY_FETCH_LIMIT

    }).done(function (results) {
        window.localStorage["history"] = JSON.stringify(results);

    }).fail(function (res) {
        console.log(res.responseJSON.error);
        alert(res.responseJSON.error.message);

    }).always(function () {});
};

let computeWordMatrixFromCached = function (historyLimit, clusterBy, numberOfVisits) {
    if (clusterBy === "title") {
        globals.wordMatrix = computeWordMatrix(
            JSON.parse(window.localStorage["history"]),
            historyLimit
        );
    } else if (clusterBy === "time") {
        globals.wordMatrix = computeWordMatrixTime(
            JSON.parse(window.localStorage["history"]),
            historyLimit, numberOfVisits
        );
    } else if (clusterBy === "combined") {
        globals.wordMatrix = computeWordMatrixCombined(
            JSON.parse(window.localStorage["history"]),
            historyLimit, numberOfVisits
        );
    }
    console.log(globals.wordMatrix);
};

let doHierarchicalCluster = function (wordMatrix) {
    let rootCluster = hierarchicalCluster(wordMatrix, pearson);
    $("#results").html("");
    printHierarchicalCluster(rootCluster, _.keys(wordMatrix), 0);
};

let doKMeans = function (wordMatrix, k) {
    let clusters = kMeansCluster(wordMatrix, pearson, k);
    $("#results").html("");
    printKMeansClusters(clusters, _.keys(wordMatrix));
};

let computeWordMatrixTime = function (historyList, historyLimit, numberOfVisits) {
    let wordMatrix = {};

    _.each(_.first(historyList, historyLimit), function (item) {
        let key = item.title || item.histUri;
        wordMatrix[key] = [];
        _.each(_.range(numberOfVisits), function (v) {
            if (item.visits[v]) {
                wordMatrix[key].push(item.visits[v].date);
            } else {
                wordMatrix[key].push(0);
            }
        });
    });

    return wordMatrix;
};

let computeWordMatrixCombined = function (historyList, historyLimit, numberOfVisits) {
    let wordMatrix = computeWordMatrix(historyList, historyLimit);

    _.each(_.first(historyList, historyLimit), function (item) {
        let key = item.title;

        if (!key) {
            return;
        }

        _.each(_.range(numberOfVisits), function (v) {
            if (item.visits[v]) {
                wordMatrix[key].push(item.visits[v].date);
            } else {
                wordMatrix[key].push(0);
            }
        });
    });

    return wordMatrix;
};

let computeWordMatrix = function (historyList, historyLimit) {
    let rows = {};

    _.each(_.first(historyList, historyLimit), function (item) {
        if (item.title === null || item.title === undefined) {
            return;
        }
        rows[item.title] = getWordCount(item.title);
    });

    let words = [];
    _.each(_.values(rows), function (wordCounts) {
        _.each(_.keys(wordCounts), function (word) {
            if (words.indexOf(word) === -1) {
                words.push(word);
            }
        });
    });

    let wordMatrix = {};
    _.each(_.keys(rows), function (title) {
        let wc = rows[title];
        wordMatrix[title] = _.map(words, function (word) {
            if (wc[word] === undefined) {
                return 0;
            }
            return wc[word];
        });
    });
    return wordMatrix;
};

let printKMeansClusters = function (clusters, labels) {
    _.each(clusters, function (cluster, i) {
        console.log("CLUSTER #" + i);
        console.log("------");

        _.each(cluster, function (itemId) {
            console.log(labels[itemId])
        });

        console.log("");
    });
};

let printHierarchicalCluster = function (cluster, labels, n) {
    let str = "";
    for (let i = 0; i < n; i++) {
        str += "&nbsp;&nbsp;&nbsp;";
    }
    if (cluster.id < 0) {
        str += "";
    } else {
        str += labels[cluster.id] || cluster.id;
    }

    $("#results").html($("#results").html() + str + "<br>");

    if (cluster.left !== null) {
        printHierarchicalCluster(cluster.left, labels, n + 1);
    }
    if (cluster.right !== null) {
        printHierarchicalCluster(cluster.right, labels, n + 1);
    }
};

let kMeansCluster = function (wordMatrix, distanceFn, k) {
    let maxIterations = 100;

    let columns = _.keys(wordMatrix).length;
    let minMaxValuesOfColumns = [];
    for (let col = 0; col < columns; col++) {
        let column = _.map(wordMatrix, function (row) {
            return row[col];
        });
        minMaxValuesOfColumns[col] = {
            min: _.min(column),
            max:_.max(column)
        };
    }

    // randomly place k centroids
    let centroids = _.map(_.range(k), function (k) {
        return _.map(_.range(columns), function (col) {
            return minMaxValuesOfColumns[col].min + Math.random() * (
                minMaxValuesOfColumns[col].max - minMaxValuesOfColumns[col].min
            );
        });
    });

    let lastMatches = null;
    for (let i = 0; i < maxIterations; i++) {
        console.log("Iteration #" + i);

        let bestMatches = _.map(_.range(k), function () {
            return [];
        });

        // assign rows to centroids closest to them
        let distances = {};

        _.each(_.keys(wordMatrix), function (key, rowNum) {
            let row = wordMatrix[key];
            let bestCentroidNum = 0;

            _.each(centroids, function (centroid, j) {
                // let distanceCacheKey1 = j + "-" + rowNum;
                let distanceCacheKey2 = bestCentroidNum + "-" + rowNum;

                if (distances[distanceCacheKey2] === undefined) {
                    distances[distanceCacheKey2] = distanceFn(centroids[bestCentroidNum], row);
                }

                // if (distances[distanceCacheKey1] === undefined) {
                //     distances[distanceCacheKey1] = distanceFn(centroid, row);
                // }

                let minDistance = distances[distanceCacheKey2];
                // let testDistance = distances[distanceCacheKey1];

                if (distanceFn(centroid, row) < minDistance) {
                    bestCentroidNum = j;
                }
            });

            bestMatches[bestCentroidNum].push(rowNum);
        });

        // if centroids didn't move since previous iteration, we're done
        if (bestMatches == lastMatches) {
            break;
        }

        lastMatches = bestMatches;

        _.each(_.range(k), function (i) {
            if (bestMatches[i].length === 0) {
                return;
            }

            let averages = _.map(_.range(wordMatrix[_.keys(wordMatrix)[0]].length), function () {
                return 0;
            });

            _.each(bestMatches[i], function (rowId) {
                _.each(_.range(wordMatrix[_.keys(wordMatrix)[rowId]].length), function (m) {
                    averages[m] += wordMatrix[_.keys(wordMatrix)[rowId]][m];
                });
            });

            centroids[i] = _.map(averages, function (av) {
                return av / bestMatches[i].length;
            });
        });
    }

    return lastMatches;
}

let hierarchicalCluster = function (wordMatrix, distanceFn) {
    let distances = {};
    let currentClustId = -1;

    let clusters = _.map(_.keys(wordMatrix), function (key, i) {
       return {
           vec: wordMatrix[key],
           id: i,
           left: null,
           right: null,
           distance: 0
       };
    });

    let clusters2 = clusters;

    while (clusters.length > 1) {
        let lowestPair = [0, 1];
        let closest = distanceFn(clusters[0].vec, clusters[1].vec);

        // look through every pair for smallest distance between vectors
        for (let i = 0; i < clusters.length; i++) {
            for (let j = i+1; j < clusters.length; j++) {
                let cacheKey = clusters[i].id + "-" + clusters[j].id;
                if (distances[cacheKey] === undefined) {
                    distances[cacheKey] = distanceFn(clusters[i].vec, clusters[j].vec);
                }

                let d = distances[cacheKey];
                // console.log(d);

                if (d < closest) {
                    closest = d;
                    lowestPair = [i, j];
                }
            }
        }

        let avgVec = _.map(clusters[lowestPair[0]].vec, function (v1, i) {
            let v2 = clusters[lowestPair[0]].vec[i];
            return (v1 + v2) / 2;
        });

        let newCluster = {
            vec: avgVec,
            left: clusters[lowestPair[0]],
            right: clusters[lowestPair[1]],
            distance: closest,
            id: currentClustId
        };

        currentClustId -= 1;
        console.log(clusters, lowestPair, clusters.length);
        clusters.splice(lowestPair[1], 1);
        clusters.splice(lowestPair[0], 1);

        clusters.push(newCluster);
        console.log(clusters.length);
    }

    return clusters[0];
};

let pearson = function (v1, v2) {
    let size = v1.length;

    let sum1 = sum(v1);
    let sum2 = sum(v2);

    let sumOfSquares1 = sum(_.map(v1), function (v) {
        return Math.pow(v, 2);
    });
    let sumOfSquares2 = sum(_.map(v2), function (v) {
        return Math.pow(v, 2);
    });

    let sumOfProducts = sum(_.map(v1, function (v, i) {
        return v * v2[i];
    }));

    let num = sumOfProducts - (sum1 * sum2 / size);
    let den = Math.sqrt((sumOfSquares1 - Math.pow(sum1, 2) / size) * (sumOfSquares2 - Math.pow(sum2, 2) / size));

    if (den === 0) {
        return 0;
    }

    return 1 - num / den;
}

let sum = function (list) {
    return _.reduce(list, function(memo, num) {
        return memo + num;
    }, 0);
}

let getWordCount = function (phrase) {
    let words = getWords(phrase);
    let wc = {};
    _.each(words, function (word) {
        let w = word.toLowerCase();
        // lazy hack... if w==='watch', wc[w] = wc[w]+1 ends up with wc[w] = function watch(...)1
        if (w === "watch") {
            return;
        }
        if (!wc[w]) {
            wc[w] = 1;
        } else {
            wc[w] = wc[w] + 1;
        }
    });
    return wc;
};

let getWords = function (phrase) {
    // split by non-alpha chars
    return phrase.split(/[^A-Z^a-z^watch]+/);
};

$("#computeWordMatrix").click(function () {
    computeWordMatrixFromCached(
        document.getElementById("historyLimit").value,
        $("[type=radio]:checked")[0].value,
        document.getElementById("numberOfVisits").value
    );
});

$("#doHierarchicalCluster").click(function () {
    $("#results").html("Loading...");
    doHierarchicalCluster(globals.wordMatrix);
});

$("#doKMeans").click(function () {
    $("#results").html("Loading...");
    doKMeans(globals.wordMatrix, document.getElementById("kMeans").value);
});

$("#fetchHistory").submit(function (e) {
    e.preventDefault();

    let email = document.getElementById("email").value;
    let password = document.getElementById("password").value;

    fetchHistory(email, password);
});