/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Peter Flannery. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as semver from 'semver';
import { flatMap, formatTagNameRegex, sortDescending } from './utils';

/*
* tags: Array<TaggedVersion>
* tagFilter: Array<string>
*/
export function tagFilter(tags, tagFilter) {
  // just show all distTags if no filters found
  if (!tagFilter || tagFilter.length === 0)
    return tags;

  // get the dist tag filter from the config
  const tagFilters = tagFilter.map(entry => entry.toLowerCase()); // make sure the filters are all lower case

  // if there isn't any tags in the filter then return all of them
  if (tagFilters.length === 0)
    return tags;

  // return the filtered tags
  return tags.filter(tag => {
    const checkTagName = tag.name.toLowerCase();
    return tagFilters.includes(checkTagName);
  });
}

/*
* versions: Array<String>
* requestedVersion: String
*
* returns: Array<TaggedVersion>
*/
export function extractTagsFromVersionList(versions, requestedVersion) {
  const taggedVersionMap = {};
  const releases = [];

  // check if this is a valid range
  const isRequestedVersionValid = semver.validRange(requestedVersion);

  // check if this is a fixed version
  const isFixed = isRequestedVersionValid && isFixedVersion(requestedVersion);

  // filter releases and prereleases
  versions.forEach(version => {
    const components = semver.prerelease(version);

    // if no prerelease components then add to releases
    if (!components || components.length === 0) {
      releases.push(version);
      return;
    }

    // make sure this pre release isn't older than the requestedVersion
    if (isRequestedVersionValid && isOlderVersion(version, requestedVersion))
      return;

    // process pre-release
    const taggedVersionName = components[0];

    // format the tag name so it groups things like alpha1, alpha2 to become alpha etc..
    const formattedTagName = formatTagName(taggedVersionName);

    // make sure this version isn't the same as the requestedVersion
    if (version === requestedVersion)
      return;

    if (!taggedVersionMap[formattedTagName])
      taggedVersionMap[formattedTagName] = [];

    taggedVersionMap[formattedTagName].push(version);
  });

  // store the latest
  const latestEntry = { name: "latest", version: releases[0] };

  // see which version the requested version satisfies
  let matchedVersion = requestedVersion;
  try {
    matchedVersion = semver.maxSatisfying(
      stripNonSemverVersions(versions),
      requestedVersion
    );
  } catch (err) {
    // console.log(err);
  }

  const matchIsLatest = semver.satisfies(matchedVersion, releases[0]);

  const satisfiesEntry = {
    name: "satisfies",
    version: matchedVersion,
    isNewerThanLatest: !matchIsLatest && matchedVersion && semver.gt(matchedVersion, latestEntry.version),
    isLatestVersion: matchIsLatest && requestedVersion.includes(latestEntry.version),
    satisfiesLatest: matchIsLatest,
    isInvalid: !isRequestedVersionValid,
    versionMatchNotFound: !matchedVersion,
    isFixedVersion: isFixed
  };

  // return an Array<TaggedVersion>
  return [
    satisfiesEntry,

    // only provide the latest when the satisfiesEntry is not the latest
    ...(satisfiesEntry.isLatestVersion ? [] : latestEntry),

    // concat all other tags if not older than the matched version
    ...Object.keys(taggedVersionMap)
      .map((name, index) => {
        return {
          name,
          version: taggedVersionMap[name][0]
        }
      })
      .sort(sortTagsRecentFirst)
  ];
}

export function isFixedVersion(versionToCheck) {
  const testRange = new semver.Range(versionToCheck);
  return testRange.set[0][0].operator === "";
}

export function isOlderVersion(version, requestedVersion) {
  let testVersion = version;

  const requestedVersionComponents = semver.prerelease(requestedVersion);
  // check the required version isn't a prerelease
  if (!requestedVersionComponents) {
    // check if the test version is a pre release
    const testVersionComponents = semver.prerelease(testVersion);
    if (testVersionComponents) {
      // strip the test version prerelease info
      // semver always see prereleases as < than releases regardless of version numbering
      testVersion = testVersion.replace('-' + testVersionComponents.join('.'), '');
      // and we only want newer prereleases
      return semver.ltr(testVersion, requestedVersion) || !semver.gtr(testVersion, requestedVersion);
    }
  }

  return semver.ltr(testVersion, requestedVersion);
}

/*
* tags: Array<TaggedVersion>
*/
export function sortTagsRecentFirst(tagA, tagB) {
  const a = tagA.version;
  const b = tagB.version;

  if (semver.lt(a, b))
    return 1;

  if (semver.gt(a, b))
    return -1;

  return sortDescending(tagA.name, tagB.name);
}

function formatTagName(tagName) {
  const regexResult = formatTagNameRegex.exec(tagName);
  if (!regexResult)
    return tagName;

  return regexResult[0];
}

function stripNonSemverVersions(versions) {
  const semverVersions = [];
  versions.forEach(version => {
    if (semver.validRange(version))
      semverVersions.push(version);
  });
  return semverVersions;
}