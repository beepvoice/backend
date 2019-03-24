# backend

Beep backend, consisting of several microservices behind traefik, which provides CORS, SSL and authentication services, and orchestrated with docker. The name of each microservice is derived from its folder name. For example, the name of the microservice in `backend-auth` is `auth`. As always, more information, such as API docs, can be found in the individual READMEs of each service.

## Quickstart

Requires [docker-compose](https://docs.docker.com/compose/).

```
git clone git@makerforce.io:beep/backend.git
git submodule update --init --recursive
docker-compose up --build
```

## Background services

The microservices of Beep rely on a few background services, listed below. All of them are covered by the docker-compose file, but in case one wishes to run a service separately, they need to be provided. What a service needs is mentioned in its description.

| Name | Website |
| ---- | ------- |
| `postgres` | [https://www.postgresql.org/] |
| `redis` | [https://redis.io/] |
| `nats` | [https://nats.io/] |

## Services

The microservices of the Beep backend can be grouped into groups which each cover one of a few different areas of functionality, described below:

### Auth

`auth` and `login` handle the authentication of user requests, coupled closely with `traefik`.

#### `login`

URL: `<base-url>:1837`

`login` takes a phone number and client id and then does a SMS OTP verification of the phone number. Client ID can be any value, but it is highly recommended that it be a unique value, like a MAC address or UUID. If verification succeeds, a signed JWT of the user id and client id is issued. This token will be used by the client for all future attempts of authentication.

`login` relies on a running `redis` instance.

#### `auth`

`auth` is completely invisible to the client. When traefik processes a request with a method other than `OPTIONS`, it calls `auth`, which parses the `Authorization` header looking for bearer authentication. If such a header is found, the token is retrieved and its signature verified. If all this succeeds, the request is allowed through with the `X-User-Claim` header populated by the token's contents. Otherwise, an error is returned and traefik rejects the request.

`auth` does not rely on anything, but is a bit pointless without a `traefik` instance calling on it.

### Core

URL: `<base-url>/core`

`core` handles the retrieval and updating of the information that is not updated comparatively often. For example: user, conversation or contact data. Call this service to do things related to such information. It relies on the `X-User-Claim` header being populated by `auth`, mentioned previously. If you run this service without putting it behind a `traefik` router calling `auth`, then any old person can populate that header and claim to be anyone. I hope I don't need to say why that is insecure.

`core` relies on a running `postgres` instance. Is insecure if not behind `traefik` calling `auth`.

### Bite pipeline

Audio data in Beep is stored in discrete packets called "bites". The Bite pipeline takes in bites and processes them, doing things like storage and transcription to text. `publish` receives the bites, publishing them to `nats`, from which the processing services receive bite events. Output is then published again to `nats`, received by `subscribe` which pushes them as Server Sent Events.

#### `publish`

URL: `<base-url>/publish`

`publish` accepts a POST request, containing a bite, and publishes it to NATs, to be received by services such as `bite` or `transcription`.

`publish` relies on a running `nats` instance. Is insecure if not behind `traefik` calling `auth`.

#### `subscribe`

URL: `<base-url>/subscribe`

`subscribe` sits on the other end of the bite pipeline, waiting for responses returned by services along it. Each request pushed to the pipeline stores the user/client ID of the requester, and the client can subscribe to `subscribe` to receive the response.

`subscribe` relies on a running `nats` instance. Is insecure if not behind `traefik` calling `auth`.

#### `store`

`store` is a wrapper around [badger](https://github.com/dgraph-io/badger). Receives data through `nats`, generating keys based on a label supplied with the data. Also supports retrieval of specific data based on key, and scanning a range of keys based on timestamp.

`store` relies on a running `nats` instance.

#### `bite`

URL: `<base-url>/bite`

`bite` stores raw audio data via `store`. Basically just acts as a forwarder to `store`, adding labels to the data and accepting HTTP requests to retrieve the data.

`bite` relies on a running `nats` instance. Is insecure if not behind `traefik` calling `auth`.

#### `transcription`

URL: `<base-url>/transcription`

`transcription` takes the raw audio data, packages it and then sends it to the [Google Cloud Speech-to-Text](https://cloud.google.com/speech-to-text/). Sends the transcripted result to `store` to be stored. Handles HTTP requests to retrieve transcriptions too.

`transcription` relies on a running `nats` instance. Is insecure if not behind `traefik` calling `auth`.

## Staging

