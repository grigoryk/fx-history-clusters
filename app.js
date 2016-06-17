let HISTORY_LIMIT = 20000;

let fetchHistory = function (email, password) {
    $.post("https://fennec-history-proxy.herokuapp.com/history", {
        email: email,
        password: password,
        limit: HISTORY_LIMIT

    }).done(function (results) {
        window.localStorage["history"] = JSON.stringify(results);

    }).fail(function (res) {
        console.log(res.responseJSON.error);
        alert(res.responseJSON.error.message);

    }).always(function () {});
};

let processFetchedHistory = function () {
    processHistory(
        JSON.parse(window.localStorage["history"])
    );
}

let processHistory = function (historyList) {
    let rows = {};

    _.each(_.first(historyList, 300), function (item) {
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

    let rootCluster = hierarchicalCluster(wordMatrix, pearson);
    printHierarchicalCluster(rootCluster, _.keys(wordMatrix), 0);
};

let printHierarchicalCluster = function (cluster, labels, n) {
    let str = "";
    for (let i = 0; i < n; i++) {
        str += " ";
    }
    if (cluster.id < 0) {
        str += "-";
    } else {
        str += labels[cluster.id] || cluster.id;
    }

    console.log(str);

    if (cluster.left !== null) {
        printHierarchicalCluster(cluster.left, labels, n + 1);
    }
    if (cluster.right !== null) {
        printHierarchicalCluster(cluster.right, labels, n + 1);
    }
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

$("#processFetchedHistory").click(function () {
    processFetchedHistory();
});

$("#fetchHistory").submit(function (e) {
    e.preventDefault();

    let email = document.getElementById("email").value;
    let password = document.getElementById("password").value;

    fetchHistory(email, password);
});